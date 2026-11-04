import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runLabTrial, buildLabPayload, writeTamperedTag } from '@/lib/nfcLabRunner';
import { DEFAULT_CONDITION } from '@/lib/nfcLab';
import { nfcEnv } from '@/lib/webNfc';
import { encodeTag } from '@/lib/tagCodec';

/**
 * One simulated physical tag with Chrome's Web NFC semantics:
 * - write(overwrite:false) on a tag holding data -> NotAllowedError
 * - reads return whatever was last written; `present=false` models no tag in range
 */
const tag = { records: [] as any[], present: true, failWrites: 0 };
class FakeReader {
  listeners: Record<string, Array<(e: any) => void>> = {};
  addEventListener(t: string, l: (e: any) => void) { (this.listeners[t] ||= []).push(l); }
  async scan() {
    if (!tag.present) return; // never fires: times out
    setTimeout(() => (this.listeners.reading || []).forEach((l) => l({
      serialNumber: '04:a1',
      message: { records: tag.records.map((r) => r.recordType === 'text'
        ? { recordType: 'text', encoding: 'utf-8', data: new DataView(new TextEncoder().encode(r.data).buffer) }
        : r.recordType === 'empty' ? { recordType: 'empty' } : { recordType: r.recordType, data: new DataView(r.data) }) },
    })), 2);
  }
  async write(msg: any, opts: any) {
    if (tag.failWrites > 0) { tag.failWrites--; throw new DOMException('IO error', 'NetworkError'); }
    const hasData = tag.records.some((r) => r.recordType !== 'empty');
    if (!opts.overwrite && hasData) throw new DOMException('NFC tag is not empty and overwrite is set to false.', 'NotAllowedError');
    tag.records = msg.records;
  }
}

const fast = { timeoutMs: 100 };

beforeEach(() => {
  tag.records = []; tag.present = true; tag.failWrites = 0;
  vi.spyOn(nfcEnv, 'getReaderCtor').mockReturnValue(FakeReader as any);
  vi.spyOn(nfcEnv, 'isSecureContext').mockReturnValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe('runLabTrial', () => {
  it('write-blank succeeds on a blank tag and records on-tag bytes', async () => {
    const o = await runLabTrial('write-blank', DEFAULT_CONDITION, fast);
    expect(o).toMatchObject({ opSucceeded: true, outcomeMatched: true, attemptsUsed: 1, detectedFormat: 'v3-binary' });
    expect(o.tagBytes).toBeGreaterThan(250);
  });

  it('write-blank on a tag that holds data fails with not-empty', async () => {
    await runLabTrial('write-blank', DEFAULT_CONDITION, fast);
    const o = await runLabTrial('write-blank', DEFAULT_CONDITION, fast);
    expect(o).toMatchObject({ opSucceeded: false, outcomeMatched: false, errorCode: 'not-empty' });
  });

  it('protect-check passes only when the write is refused because the tag holds data', async () => {
    const onBlank = await runLabTrial('protect-check', DEFAULT_CONDITION, fast);
    expect(onBlank).toMatchObject({ outcomeMatched: false, errorCode: 'protection-bypassed' });
    const onWritten = await runLabTrial('protect-check', DEFAULT_CONDITION, fast);
    expect(onWritten).toMatchObject({ outcomeMatched: true, errorCode: 'not-empty' });
  });

  it('overwrite replaces existing data and confirms it by read-back', async () => {
    await runLabTrial('write-blank', { ...DEFAULT_CONDITION, format: 'v1-text' }, fast);
    const o = await runLabTrial('overwrite', DEFAULT_CONDITION, fast);
    expect(o).toMatchObject({ opSucceeded: true, outcomeMatched: true, readBackMatched: true });
    expect(tag.records[0].recordType).toBe('unknown');
  });

  it('read verifies a lab-written tag (V3 and V1)', async () => {
    for (const format of ['v3-binary', 'v1-text']) {
      await runLabTrial('read-after-write', { ...DEFAULT_CONDITION, format }, fast);
      const o = await runLabTrial('read', DEFAULT_CONDITION, fast);
      expect(o).toMatchObject({ opSucceeded: true, outcomeMatched: true, detectedFormat: format, serialNumber: '04:a1' });
      expect(o.decodeVerifyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('tamper-read passes when an edited tag is rejected', async () => {
    const payload = await buildLabPayload('medium');
    const encoded = await encodeTag({ ...payload, triageData: { ...payload.triageData, bloodGroup: 'AB-Positive' } }, 'v3-binary');
    tag.records = encoded.records;
    const o = await runLabTrial('tamper-read', DEFAULT_CONDITION, fast);
    expect(o).toMatchObject({ outcomeMatched: true, errorCode: 'verify-failed' });
  });

  it('the tampered-tag setup helper produces a tag that tamper-read rejects', async () => {
    await writeTamperedTag(DEFAULT_CONDITION, fast);
    expect(await runLabTrial('tamper-read', DEFAULT_CONDITION, fast)).toMatchObject({ outcomeMatched: true, errorCode: 'verify-failed' });
    expect(await runLabTrial('read', DEFAULT_CONDITION, fast)).toMatchObject({ outcomeMatched: false });
  });

  it('tamper-read on a blank tag is NOT counted as a detected tamper', async () => {
    const o = await runLabTrial('tamper-read', DEFAULT_CONDITION, fast);
    expect(o).toMatchObject({ outcomeMatched: false, errorCode: 'blank-tag' });
  });

  it('a read with no tag in range times out and is recorded as a failure', async () => {
    tag.present = false;
    const o = await runLabTrial('read', DEFAULT_CONDITION, fast);
    expect(o).toMatchObject({ opSucceeded: false, outcomeMatched: false, errorCode: 'timeout' });
  });

  it('records internal retries after transient IO errors', async () => {
    tag.failWrites = 2;
    const o = await runLabTrial('write-blank', DEFAULT_CONDITION, { timeoutMs: 3000 }); // room for 2 x 300 ms retry delays
    expect(o).toMatchObject({ outcomeMatched: true, attemptsUsed: 3 });
  });

  it('erase leaves the tag blank, confirmed by read-back', async () => {
    await runLabTrial('write-blank', DEFAULT_CONDITION, fast);
    const o = await runLabTrial('erase', DEFAULT_CONDITION, fast);
    expect(o).toMatchObject({ opSucceeded: true, outcomeMatched: true, readBackMatched: true });
  });

  it('large V1 payloads are bigger on tag than V3 (the format factor matters)', async () => {
    const v1 = await runLabTrial('read-after-write', { ...DEFAULT_CONDITION, profile: 'large', format: 'v1-text' }, fast);
    const v3 = await runLabTrial('read-after-write', { ...DEFAULT_CONDITION, profile: 'large', format: 'v3-binary' }, fast);
    expect(v1.tagBytes!).toBeGreaterThan(v3.tagBytes!);
  });
});
