import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BenchNfc from '@/pages/BenchNfc';
import { nfcEnv } from '@/lib/webNfc';

let records: any[] = [];
class FakeReader {
  listeners: Record<string, Array<(e: any) => void>> = {};
  addEventListener(t: string, l: (e: any) => void) { (this.listeners[t] ||= []).push(l); }
  async scan() {
    setTimeout(() => (this.listeners.reading || []).forEach((l) => l({
      serialNumber: '04:aa',
      message: { records: records.map((r) => r.recordType === 'text'
        ? { recordType: 'text', encoding: 'utf-8', data: new DataView(new TextEncoder().encode(r.data).buffer) }
        : { recordType: r.recordType, data: new DataView(r.data) }) },
    })), 2);
  }
  async write(msg: any) { records = msg.records; }
}

describe('NFC Lab page', () => {
  beforeEach(() => {
    localStorage.clear();
    records = [];
    vi.spyOn(nfcEnv, 'getReaderCtor').mockReturnValue(FakeReader as any);
    vi.spyOn(nfcEnv, 'isSecureContext').mockReturnValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it('runs a write + read-back trial, records it, and summarizes it', async () => {
    render(<BenchNfc />);
    fireEvent.click(screen.getByRole('button', { name: 'Run trial' }));
    await waitFor(() => expect(screen.getByTestId('lab-status')).toHaveTextContent(/PASS/), { timeout: 5000 });
    expect(screen.getByText(/5\. Results \(1 trials, 1 passed\)/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('aegistag_nfc_lab_v2')!)).toHaveLength(1);
  });

  it('generates a randomized plan and executes its first step', async () => {
    render(<BenchNfc />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate plan' }));
    // default: 4 distances x 2 trial types x 10 reps
    expect(screen.getByText(/Step 1 of 80/)).toBeInTheDocument();
    records = []; // first step may be a read: give it a valid tag
    fireEvent.click(screen.getByRole('button', { name: 'Run trial' }));
    await waitFor(() => expect(screen.getByTestId('lab-status')).toHaveTextContent(/PASS/), { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: 'Run step' }));
    await waitFor(() => expect(screen.getByText(/Step 2 of 80/)).toBeInTheDocument(), { timeout: 5000 });
  });

  it('self-test round-trips every profile and format without a tag', async () => {
    render(<BenchNfc />);
    fireEvent.click(screen.getByRole('button', { name: /Run self-test/ }));
    await waitFor(() => expect(screen.getByTestId('lab-status')).toHaveTextContent('Self-test passed.'), { timeout: 10000 });
  });

  it('disables trials and explains why when Web NFC is unavailable', () => {
    vi.mocked(nfcEnv.getReaderCtor).mockReturnValue(undefined);
    render(<BenchNfc />);
    expect(screen.getByRole('button', { name: 'Run trial' })).toBeDisabled();
  });
});
