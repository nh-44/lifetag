import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import NfcScanner from '@/components/nfc/NfcScanner';
import { NfcCryptoService } from '@/services/nfcCryptoService';
import { nfcEnv } from '@/lib/webNfc';
import { encodeTag } from '@/lib/tagCodec';

vi.mock('@/services/api', () => ({ logBenchmarkTelemetry: vi.fn() }));

type Listener = (e: any) => void;
let reader: { emit: (t: string, e: any) => void; scanStarted: boolean } | null = null;
let scanImpl: () => Promise<void> = async () => undefined;

class FakeReader {
  listeners: Record<string, Listener[]> = {};
  scanStarted = false;
  constructor() { reader = this as any; }
  addEventListener(t: string, l: Listener) { (this.listeners[t] ||= []).push(l); }
  emit(t: string, e: any) { (this.listeners[t] || []).forEach((l) => l(e)); }
  scan() { this.scanStarted = true; return scanImpl(); }
}

const textRecord = (s: string) => ({ recordType: 'text', encoding: 'utf-8', data: new DataView(new TextEncoder().encode(s).buffer) });

async function tap(message: any) {
  await waitFor(() => expect(reader?.scanStarted).toBe(true));
  await act(async () => { reader!.emit('reading', { message, serialNumber: '04:01' }); });
}

describe('NfcScanner', () => {
  const onComplete = vi.fn();
  const onError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    reader = null;
    scanImpl = async () => undefined;
    vi.spyOn(nfcEnv, 'getReaderCtor').mockReturnValue(FakeReader as any);
    vi.spyOn(nfcEnv, 'isSecureContext').mockReturnValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  const renderScanning = () => render(<NfcScanner isScanning={true} onScanComplete={onComplete} onScanError={onError} />);

  it('never simulates: an unsupported browser gets the real reason and no fake payload', async () => {
    vi.mocked(nfcEnv.getReaderCtor).mockReturnValue(undefined);
    renderScanning();
    expect(screen.getByTestId('nfc-unsupported')).toHaveTextContent(/Chrome on Android/);
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/Chrome on Android/)));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('explains HTTPS is required on an insecure origin', async () => {
    vi.mocked(nfcEnv.isSecureContext).mockReturnValue(false);
    renderScanning();
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/HTTPS/)));
  });

  it('reads and verifies a real V3 binary tag', async () => {
    const payload = await NfcCryptoService.generateTagPayload({
      name: 'Jane', bloodGroup: 'O+', allergies: [], emergencyContacts: [], dnrStatus: false, fhirPatientId: '54321',
    });
    const { records } = await encodeTag(payload, 'v3-binary');
    renderScanning();
    await tap({ records: [{ recordType: 'unknown', data: new DataView(records[0].data as ArrayBuffer) }] });
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('54321', expect.objectContaining({ fhirPatientId: '54321' })));
  });

  it('reads a V1 gzip text tag', async () => {
    const payload = await NfcCryptoService.generateTagPayload({
      name: 'Jane', bloodGroup: 'O+', allergies: [], emergencyContacts: [], dnrStatus: false, fhirPatientId: '54321',
    });
    const { records } = await encodeTag(payload, 'v1-text');
    renderScanning();
    await tap({ records: [textRecord(records[0].data as string)] });
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('54321', expect.anything()));
  });

  it('rejects a tampered tag with the verification error', async () => {
    vi.spyOn(NfcCryptoService, 'verifyTagIntegrity').mockResolvedValue({ verified: false, trustedAuthority: false, error: 'Signature tampered' });
    const payload = await NfcCryptoService.generateTagPayload({
      name: 'Jane', bloodGroup: 'O+', allergies: [], emergencyContacts: [], dnrStatus: false, fhirPatientId: '54321',
    });
    const { records } = await encodeTag(payload, 'v3-binary');
    renderScanning();
    await tap({ records: [{ recordType: 'unknown', data: new DataView(records[0].data as ArrayBuffer) }] });
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Signature tampered'));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reports a blank tag clearly', async () => {
    renderScanning();
    await tap({ records: [] });
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/blank/)));
  });

  it('reports an unreadable tag (readingerror) instead of hanging', async () => {
    renderScanning();
    await waitFor(() => expect(reader?.scanStarted).toBe(true));
    await act(async () => { reader!.emit('readingerror', {}); });
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/no readable NDEF/)));
  });

  it('reports invalid JSON on a text tag', async () => {
    renderScanning();
    await tap({ records: [textRecord('{not json')] });
    await waitFor(() => expect(onError).toHaveBeenCalled());
  });

  it('rejects a patient ID that is not 5 digits', async () => {
    renderScanning();
    await tap({ records: [textRecord(JSON.stringify({ v: '3.0', t: 1, id: '12', d: { n: 'A', b: 'O+', a: [], c: [], dnr: false } }))] });
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/5 digits/)));
  });

  it('passes ID-only tags through as unsigned without inventing clinical data', async () => {
    renderScanning();
    await tap({ records: [textRecord('54321')] });
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('54321', expect.objectContaining({ isUnsigned: true })));
    expect(onComplete.mock.calls[0][1].triageData.bloodGroup).toBe('Unknown');
  });

  it('turns permission denial into an actionable message', async () => {
    scanImpl = async () => { throw new DOMException('denied', 'NotAllowedError'); };
    renderScanning();
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/Allow NFC/)));
  });

  it('turns NFC switched off into an actionable message', async () => {
    scanImpl = async () => { throw new DOMException('NFC setting is disabled.', 'NotSupportedError'); };
    renderScanning();
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/Turn on NFC/)));
  });
});
