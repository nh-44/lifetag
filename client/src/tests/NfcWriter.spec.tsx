import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import NfcWriter from '@/components/nfc/NfcWriter';
import { fetchWithAuth } from '@/services/api';
import { certifyTagKey } from '@/services/userService';
import { nfcEnv } from '@/lib/webNfc';

vi.mock('@/services/api', () => ({
  fetchWithAuth: vi.fn(),
  logBenchmarkTelemetry: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('@/services/userService', () => ({ certifyTagKey: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

/** Fake NDEFReader acting as one physical tag: writes store records, reads return them. */
let tagRecords: any[] | null = null;
let writeImpl: (msg: any, opts: any) => Promise<void>;
const writes: Array<{ msg: any; opts: any }> = [];
class FakeReader {
  listeners: Record<string, Array<(e: any) => void>> = {};
  addEventListener(t: string, l: (e: any) => void) { (this.listeners[t] ||= []).push(l); }
  async scan() {
    setTimeout(() => (this.listeners.reading || []).forEach((l) => l({
      serialNumber: '04:01',
      message: { records: (tagRecords || []).map((r) => r.recordType === 'text'
        ? { recordType: 'text', encoding: 'utf-8', data: new DataView(new TextEncoder().encode(r.data).buffer) }
        : { recordType: r.recordType, data: new DataView(r.data) }) },
    })), 5);
  }
  async write(msg: any, opts: any) { writes.push({ msg, opts }); await writeImpl(msg, opts); tagRecords = msg.records; }
}

const randomSig = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(64))));

describe('NfcWriter', () => {
  const onComplete = vi.fn();
  const onError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    writes.length = 0;
    tagRecords = null;
    writeImpl = async () => undefined;
    vi.spyOn(nfcEnv, 'getReaderCtor').mockReturnValue(FakeReader as any);
    vi.spyOn(nfcEnv, 'isSecureContext').mockReturnValue(true);
    vi.mocked(certifyTagKey).mockImplementation(async () => randomSig());
    vi.mocked(fetchWithAuth).mockResolvedValue({
      success: true,
      data: { accountId: '12345', name: 'Jane Doe', bloodGroup: 'O-Negative', allergies: ['None'], emergencyContacts: [], dnrStatus: false },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const fillAndPrepare = async (overrides: { allergies?: string } = {}) => {
    render(<NfcWriter onWriteComplete={onComplete} onWriteError={onError} />);
    fireEvent.change(screen.getByLabelText(/FHIR Patient ID/i), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'John Doe' } });
    if (overrides.allergies) fireEvent.change(screen.getByLabelText(/Allergies/i), { target: { value: overrides.allergies } });
    fireEvent.click(screen.getByRole('button', { name: /Prepare & certify/i }));
  };

  it('prepares (certifies) first, then writes a V3 binary record to a blank tag without overwrite', async () => {
    await fillAndPrepare();
    await waitFor(() => expect(screen.getByTestId('writer-status')).toHaveTextContent(/Ready: \d+ of 888 B/));
    expect(certifyTagKey).toHaveBeenCalledWith('12345', expect.objectContaining({ x: expect.any(String) }), expect.any(Number));

    fireEvent.click(screen.getByRole('button', { name: /Write to tag/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('12345'));
    expect(writes[0].msg.records[0].recordType).toBe('unknown');
    expect(writes[0].opts.overwrite).toBe(false);
  });

  it('passes overwrite: true when the operator allows overwriting', async () => {
    await fillAndPrepare();
    await waitFor(() => expect(screen.getByRole('button', { name: /Write to tag/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('switch', { name: /Allow overwriting/i }));
    fireEvent.click(screen.getByRole('button', { name: /Write to tag/i }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].opts.overwrite).toBe(true);
  });

  it('read-back verification confirms a byte-identical, signature-valid tag', async () => {
    await fillAndPrepare();
    await waitFor(() => expect(screen.getByRole('button', { name: /Write to tag/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Write to tag/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Verify/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Verify/i }));
    // Random test certificate is not a configured trust anchor: verified but not trusted
    await waitFor(() => expect(screen.getByTestId('writer-status')).toHaveTextContent(/^Verified/));
  });

  it('read-back verification catches a tag that holds different data', async () => {
    await fillAndPrepare();
    await waitFor(() => expect(screen.getByRole('button', { name: /Write to tag/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Write to tag/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Verify/i })).toBeEnabled());
    tagRecords = [{ recordType: 'text', data: '99999' }]; // someone rewrote the tag
    fireEvent.click(screen.getByRole('button', { name: /Verify/i }));
    await waitFor(() => expect(screen.getByTestId('writer-status')).toHaveTextContent(/does not contain the data/));
  });

  it('refuses to prepare a payload larger than the selected tag and never writes', async () => {
    const allergies = Array.from({ length: 45 }, (_, i) => `Severe allergy number ${i}`).join(', ');
    await fillAndPrepare({ allergies });
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/needs \d+ B but an NTAG216 holds 888 B/)));
    expect(screen.getByRole('button', { name: /Write to tag/i })).toBeDisabled();
  });

  it('a failed certification (not a doctor) blocks the write', async () => {
    vi.mocked(certifyTagKey).mockRejectedValue(new Error('Access denied. Requires one of: DOCTOR'));
    await fillAndPrepare();
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/DOCTOR/)));
    expect(screen.getByRole('button', { name: /Write to tag/i })).toBeDisabled();
  });

  it('shows the actionable hint when the tag already has data and overwrite is off', async () => {
    writeImpl = async () => { throw new DOMException('NFC tag is not empty and overwrite is set to false.', 'NotAllowedError'); };
    await fillAndPrepare();
    await waitFor(() => expect(screen.getByRole('button', { name: /Write to tag/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Write to tag/i }));
    await waitFor(() => expect(screen.getByTestId('writer-status')).toHaveTextContent(/overwrite was not allowed/));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('disables writing (no simulation) when Web NFC is unavailable', async () => {
    vi.mocked(nfcEnv.getReaderCtor).mockReturnValue(undefined);
    await fillAndPrepare();
    expect(screen.getByTestId('nfc-unsupported')).toHaveTextContent(/Chrome on Android/);
    await waitFor(() => expect(screen.getByTestId('writer-status')).toHaveTextContent(/Ready/));
    expect(screen.getByRole('button', { name: /Write to tag/i })).toBeDisabled();
  });

  it('handles backend API failure during fetch profile', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue({ success: false, error: { message: 'Server down' } });
    const { toast } = await import('sonner');
    render(<NfcWriter onWriteComplete={onComplete} onWriteError={onError} />);
    fireEvent.change(screen.getByLabelText(/Auto-Fill from Account ID/i), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /Fetch Profile/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Server down'));
  });
});
