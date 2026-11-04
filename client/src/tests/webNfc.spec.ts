import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  nfcEnv, getNfcSupport, readTagOnce, writeTag, eraseTag, describeNfcError, describeWriteError, makeTagReadOnly,
} from '@/lib/webNfc';

type Listener = (e: any) => void;

/** Scriptable stand-in for Chrome's NDEFReader. */
class FakeReader {
  static instances: FakeReader[] = [];
  static onScan: (r: FakeReader, signal?: AbortSignal) => Promise<void> = async () => undefined;
  static onWrite: (msg: any, opts: any, attempt: number) => Promise<void> = async () => undefined;
  static writeCalls = 0;
  listeners: Record<string, Listener[]> = {};
  constructor() { FakeReader.instances.push(this); }
  addEventListener(t: string, l: Listener) { (this.listeners[t] ||= []).push(l); }
  emit(t: string, e: any) { (this.listeners[t] || []).forEach((l) => l(e)); }
  scan(opts?: { signal?: AbortSignal }) { return FakeReader.onScan(this, opts?.signal); }
  write(msg: any, opts: any) { FakeReader.writeCalls++; return FakeReader.onWrite(msg, opts, FakeReader.writeCalls); }
  makeReadOnly() { return Promise.resolve(); }
}

const domErr = (name: string, message = name) => new DOMException(message, name);
/** A write that never completes until its signal aborts, like Chrome waiting for a tag. */
const pendingUntilAbort = (opts: any) =>
  new Promise<void>((_, reject) => {
    const cancel = () => reject(domErr('AbortError', 'The push operation is cancelled.'));
    if (opts.signal.aborted) cancel(); // Chrome rejects immediately for an already-aborted signal
    else opts.signal.addEventListener('abort', cancel);
  });

beforeEach(() => {
  FakeReader.instances = [];
  FakeReader.writeCalls = 0;
  FakeReader.onScan = async () => undefined;
  FakeReader.onWrite = async () => undefined;
  vi.spyOn(nfcEnv, 'getReaderCtor').mockReturnValue(FakeReader as any);
  vi.spyOn(nfcEnv, 'isSecureContext').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe('getNfcSupport', () => {
  it('explains HTTPS is required on an insecure origin', () => {
    vi.mocked(nfcEnv.isSecureContext).mockReturnValue(false);
    expect(getNfcSupport()).toMatchObject({ supported: false, reason: 'insecure-context' });
  });

  it('explains Chrome-on-Android is required when NDEFReader is missing (iOS, desktop)', () => {
    vi.mocked(nfcEnv.getReaderCtor).mockReturnValue(undefined);
    expect(getNfcSupport()).toMatchObject({ supported: false, reason: 'not-available' });
  });
});

describe('readTagOnce', () => {
  it('resolves with the message and serial number of the first tag', async () => {
    FakeReader.onScan = async (r) => { setTimeout(() => r.emit('reading', { message: { records: [] }, serialNumber: '04:aa' }), 5); };
    const res = await readTagOnce({ timeoutMs: 1000 });
    expect(res.serialNumber).toBe('04:aa');
    expect(res.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects on "readingerror" (an unreadable tag) instead of hanging', async () => {
    FakeReader.onScan = async (r) => { setTimeout(() => r.emit('readingerror', {}), 5); };
    await expect(readTagOnce({ timeoutMs: 1000 })).rejects.toMatchObject({ failure: { code: 'unreadable' } });
  });

  it('times out with a TimeoutError and aborts the scan session', async () => {
    let scanSignal: AbortSignal | undefined;
    FakeReader.onScan = async (_r, signal) => { scanSignal = signal; };
    const err = await readTagOnce({ timeoutMs: 30 }).catch((e) => e);
    expect(describeNfcError(err).code).toBe('timeout');
    expect(scanSignal?.aborted).toBe(true);
  });

  it('aborts the scan session after success too (no dangling reader mode)', async () => {
    let scanSignal: AbortSignal | undefined;
    FakeReader.onScan = async (r, signal) => { scanSignal = signal; setTimeout(() => r.emit('reading', { message: { records: [] } }), 1); };
    await readTagOnce({ timeoutMs: 1000 });
    expect(scanSignal?.aborted).toBe(true);
  });

  it('surfaces scan() rejection (NFC switched off) with an actionable hint', async () => {
    FakeReader.onScan = async () => { throw domErr('NotSupportedError', 'NFC setting is disabled.'); };
    const err = await readTagOnce({ timeoutMs: 1000 }).catch((e) => e);
    expect(describeNfcError(err)).toMatchObject({ code: 'unsupported' });
    expect(describeNfcError(err).hint).toMatch(/Turn on NFC/);
  });
});

describe('writeTag', () => {
  const records = [{ recordType: 'text' as const, data: 'x', lang: 'en' }];

  it('passes the overwrite flag through to write()', async () => {
    const seen: any[] = [];
    FakeReader.onWrite = async (_m, opts) => { seen.push(opts.overwrite); };
    await writeTag(records, { overwrite: false });
    await writeTag(records, { overwrite: true });
    expect(seen).toEqual([false, true]);
  });

  it('retries a transient NetworkError (tag moved) and reports the attempt count', async () => {
    FakeReader.onWrite = async (_m, _o, attempt) => { if (attempt < 3) throw domErr('NetworkError', 'IO error'); };
    const res = await writeTag(records, { retryDelayMs: 1 });
    expect(res.attemptsUsed).toBe(3);
  });

  it('does not retry non-transient errors (permission)', async () => {
    FakeReader.onWrite = async () => { throw domErr('NotAllowedError', 'denied'); };
    await expect(writeTag(records, { retryDelayMs: 1 })).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(FakeReader.writeCalls).toBe(1);
  });

  it('classifies a refused write to a non-empty tag (overwrite: false) as not-empty', async () => {
    FakeReader.onWrite = async () => { throw domErr('NotAllowedError', 'NFC tag is not empty and overwrite is set to false.'); };
    const err = await writeTag(records, { overwrite: false }).catch((e) => e);
    expect(describeNfcError(err).code).toBe('not-empty');
  });

  it('times out a write that never sees a tag, instead of waiting forever', async () => {
    FakeReader.onWrite = (_m, opts) => pendingUntilAbort(opts);
    const err = await writeTag(records, { timeoutMs: 30 }).catch((e) => e);
    expect(describeNfcError(err).code).toBe('timeout');
  });

  it('a write superseded before it starts never calls write() (cannot hold the lock forever)', async () => {
    const first = writeTag(records, { timeoutMs: 5000 }).catch((e) => e);
    await writeTag(records, { timeoutMs: 5000 });
    expect(describeNfcError(await first).code).toBe('cancelled');
    expect(FakeReader.writeCalls).toBe(1);
  });

  it('a second operation supersedes the first deliberately, and the second still succeeds', async () => {
    let call = 0;
    FakeReader.onWrite = (_m, opts) => (++call === 1 ? pendingUntilAbort(opts) : Promise.resolve());
    const first = writeTag(records, { timeoutMs: 5000 }).catch((e) => e);
    await vi.waitFor(() => expect(FakeReader.writeCalls).toBe(1)); // first write is pending on the tag
    const second = await writeTag(records, { timeoutMs: 5000 });
    expect(second.attemptsUsed).toBe(1);
    expect(describeNfcError(await first).code).toBe('cancelled');
  });

  it('eraseTag writes a single empty record with overwrite', async () => {
    let msg: any, opts: any;
    FakeReader.onWrite = async (m, o) => { msg = m; opts = o; };
    await eraseTag();
    expect(msg.records).toEqual([{ recordType: 'empty' }]);
    expect(opts.overwrite).toBe(true);
  });

  it('makeTagReadOnly resolves when supported', async () => {
    await expect(makeTagReadOnly()).resolves.toHaveProperty('elapsedMs');
  });
});

describe('describeNfcError', () => {
  it.each([
    ['NotReadableError', 'Could not start NFC', 'busy'],
    ['NetworkError', 'IO error', 'io'],
    ['AbortError', 'The push operation is cancelled.', 'cancelled'],
  ])('%s -> %s', (name, message, code) => {
    expect(describeNfcError(domErr(name, message)).code).toBe(code);
  });
});

const setPermission = (state: string) =>
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state }) } });

describe('describeWriteError (overwrite:false refusals)', () => {
  const vague = new DOMException('Failed to write', 'NotAllowedError'); // wording Chrome may use

  it('treats NotAllowedError as not-empty when NFC permission is already granted', async () => {
    setPermission('granted');
    expect((await describeWriteError(vague, false)).code).toBe('not-empty');
  });

  it('keeps it a permission problem when permission is not granted', async () => {
    setPermission('prompt');
    expect((await describeWriteError(vague, false)).code).toBe('permission');
  });

  it('never reclassifies writes that allowed overwriting', async () => {
    setPermission('granted');
    expect((await describeWriteError(vague, true)).code).toBe('permission');
  });
});
