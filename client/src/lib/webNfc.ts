/**
 * The only module that touches the Web NFC API. Every scan/write in the app goes
 * through here so the failure modes found in real trials are handled once:
 *
 *  - Only ONE NFC operation may be pending per page. Chrome cancels a pending
 *    write when another write starts ("AbortError: The push operation is
 *    cancelled"), which is what a second button press used to trigger. The
 *    lock aborts the previous operation deliberately instead.
 *  - Unreadable tags are reported through the "readingerror" event. Listening
 *    for "error" (as the old code did) never fires, so a blank/non-NDEF tag
 *    hung the scanner forever.
 *  - Every operation has a timeout and is always aborted on exit, so no stale
 *    reader-mode session survives to interfere with the next operation.
 *  - Writes retry only on NetworkError (tag moved mid-transfer). Permission,
 *    support, and cancellation errors are not transient and are surfaced at once.
 *  - The screen is kept awake during an operation: Chrome suspends NFC when the
 *    page is hidden, which cancels a pending write.
 */
import type { NdefRecordInit, NdefRecordLike } from "@/lib/tagCodec";

export interface NdefMessageLike {
  records: NdefRecordLike[];
}

interface NdefReaderLike {
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(message: { records: NdefRecordInit[] }, options?: { signal?: AbortSignal; overwrite?: boolean }): Promise<void>;
  makeReadOnly?(options?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener?(type: string, listener: (event: any) => void): void;
}

type ReaderCtor = new () => NdefReaderLike;

/** Overridable for tests. */
export const nfcEnv = {
  getReaderCtor: (): ReaderCtor | undefined =>
    typeof window !== "undefined" ? ((window as any).NDEFReader as ReaderCtor | undefined) : undefined,
  isSecureContext: () => (typeof window !== "undefined" ? window.isSecureContext : false),
  now: () => performance.now(),
};

// ---------------------------------------------------------------------------
// Support & diagnostics
// ---------------------------------------------------------------------------

// A flat shape (not a discriminated union): the client tsconfig is non-strict, which
// disables narrowing on the boolean discriminant.
export interface NfcSupport {
  supported: boolean;
  reason?: "insecure-context" | "not-available";
  message: string;
}

export function getNfcSupport(): NfcSupport {
  if (!nfcEnv.isSecureContext()) {
    return { supported: false, reason: "insecure-context", message: "Web NFC only works over HTTPS (or localhost). Open the https:// address of this app." };
  }
  if (!nfcEnv.getReaderCtor()) {
    return {
      supported: false,
      reason: "not-available",
      message: "Web NFC is not available in this browser. Use Chrome on Android (iOS Safari and desktop browsers do not support it).",
    };
  }
  return { supported: true, message: "Web NFC is available." };
}

export function canMakeReadOnly(): boolean {
  const Ctor = nfcEnv.getReaderCtor();
  return !!Ctor && typeof (Ctor.prototype as any)?.makeReadOnly === "function";
}

export async function getNfcPermission(): Promise<PermissionState | "unknown"> {
  try {
    const status = await navigator.permissions.query({ name: "nfc" as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}

export type NfcErrorCode =
  | "timeout" | "cancelled" | "permission" | "unsupported" | "busy" | "io"
  | "not-empty" | "too-large" | "read-only" | "unreadable" | "page-hidden" | "unknown";

export interface NfcFailure {
  code: NfcErrorCode;
  /** Exact browser error, for the trial log. */
  raw: string;
  /** What the operator should do next. */
  hint: string;
}

export class NfcOperationError extends Error {
  constructor(public failure: NfcFailure) {
    super(failure.raw);
    this.name = "NfcOperationError";
  }
}

export function describeNfcError(e: unknown): NfcFailure {
  if (e instanceof NfcOperationError) return e.failure;
  const name = (e as any)?.name || "Error";
  const msg = (e as any)?.message || String(e);
  const raw = `${name}: ${msg}`;
  const m = msg.toLowerCase();

  if (name === "TimeoutError") return { code: "timeout", raw, hint: "No tag was detected in time. Hold the tag flat against the NFC antenna (usually the upper back) and keep it still." };
  if (name === "NotAllowedError" && /not empty|non-empty|overwrite/.test(m))
    return { code: "not-empty", raw, hint: "The tag already holds data and overwrite was not allowed. Use Overwrite, or Erase the tag first." };
  if (name === "NotAllowedError" && /read.?only|locked|write.?protect/.test(m))
    return { code: "read-only", raw, hint: "The tag is write-protected (read-only) and can never be written again." };
  if (name === "NotAllowedError")
    return { code: "permission", raw, hint: "NFC permission was denied, or the page was not in the foreground. Allow NFC for this site (lock icon → Permissions) and keep the screen on." };
  if (name === "NotSupportedError")
    return { code: "unsupported", raw, hint: "NFC is switched off or unavailable. Turn on NFC in Android Settings → Connected devices, then retry. Also confirm the tag is NDEF-compatible (NTAG21x)." };
  if (name === "NotReadableError")
    return { code: "busy", raw, hint: "The NFC adapter is busy or another app/tab is using it. Close other NFC apps (e.g. NFC Tools) and other tabs of this site." };
  if (name === "NetworkError" && /size|capacity|too (large|big)|space/.test(m))
    return { code: "too-large", raw, hint: "The message does not fit on this tag. Use the V3 binary format or a larger tag (NTAG216)." };
  if (name === "NetworkError")
    return { code: "io", raw, hint: "The tag moved out of range during the transfer. Hold it completely still for 2–3 seconds." };
  if (name === "AbortError" && typeof document !== "undefined" && document.hidden)
    return { code: "page-hidden", raw, hint: "The page went to the background (screen off or app switch), which cancels NFC. Keep the screen on." };
  if (name === "AbortError")
    return { code: "cancelled", raw, hint: "The operation was cancelled, usually because another NFC operation started. Start one operation at a time." };
  if (name === "TagDecodeError") return { code: "unreadable", raw, hint: msg };
  return { code: "unknown", raw, hint: msg };
}

// ---------------------------------------------------------------------------
// Single-operation lock + wake lock
// ---------------------------------------------------------------------------

let current: { controller: AbortController; done: Promise<void> } | null = null;

async function acquire(): Promise<{ controller: AbortController; release: () => void }> {
  if (current) {
    current.controller.abort(new DOMException("Superseded by a newer NFC operation", "AbortError"));
    await current.done.catch(() => undefined);
  }
  const controller = new AbortController();
  let release!: () => void;
  const done = new Promise<void>((r) => (release = r));
  const mine = { controller, done };
  current = mine;
  return {
    controller,
    release: () => {
      if (current === mine) current = null;
      release();
    },
  };
}

/** Aborts whatever NFC operation is pending (e.g. when a scanner unmounts). */
export function cancelNfcOperation() {
  current?.controller.abort(new DOMException("Cancelled", "AbortError"));
}

async function holdWakeLock(): Promise<() => void> {
  try {
    const sentinel = await (navigator as any).wakeLock?.request("screen");
    return () => sentinel?.release?.().catch(() => undefined);
  } catch {
    return () => undefined;
  }
}

function linkSignal(controller: AbortController, external?: AbortSignal) {
  if (!external) return;
  if (external.aborted) controller.abort(external.reason);
  else external.addEventListener("abort", () => controller.abort(external.reason), { once: true });
}

function requireReader(): NdefReaderLike {
  const support = getNfcSupport();
  if (!support.supported) {
    throw new NfcOperationError({ code: "unsupported", raw: `Unsupported: ${support.reason}`, hint: support.message });
  }
  return new (nfcEnv.getReaderCtor()!)();
}

const timeoutError = (ms: number) => new DOMException(`No tag detected within ${Math.round(ms / 1000)} s`, "TimeoutError");

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export interface ReadResult {
  message: NdefMessageLike;
  serialNumber: string;
  /** Operation start (scan() call) to "reading" event. */
  elapsedMs: number;
}

/** Waits for one tag, returns its NDEF message, then stops scanning. */
export async function readTagOnce(opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<ReadResult> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const reader = requireReader();
  const { controller, release } = await acquire();
  linkSignal(controller, opts.signal);
  const releaseWake = await holdWakeLock();
  const start = nfcEnv.now();

  try {
    return await new Promise<ReadResult>((resolve, reject) => {
      const timer = setTimeout(() => controller.abort(timeoutError(timeoutMs)), timeoutMs);
      const fail = (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      };
      if (controller.signal.aborted) return fail(controller.signal.reason);
      controller.signal.addEventListener("abort", () => fail(controller.signal.reason), { once: true });
      reader.addEventListener("reading", (event: any) => {
        clearTimeout(timer);
        resolve({ message: event.message, serialNumber: event.serialNumber || "", elapsedMs: nfcEnv.now() - start });
      });
      reader.addEventListener("readingerror", () =>
        fail(new NfcOperationError({
          code: "unreadable",
          raw: "readingerror: tag detected but could not be read as NDEF",
          hint: "The tag was detected but holds no readable NDEF data. It may be blank and unformatted, damaged, or not an NTAG21x tag. Try writing it first.",
        }))
      );
      reader.scan({ signal: controller.signal }).catch(fail);
    });
  } finally {
    controller.abort(); // always end the reader-mode session
    releaseWake();
    release();
  }
}

export interface WriteResult {
  attemptsUsed: number;
  /** First write() call to successful completion, across retries. */
  elapsedMs: number;
}

export async function writeTag(
  records: NdefRecordInit[],
  opts: { overwrite?: boolean; timeoutMs?: number; signal?: AbortSignal; maxAttempts?: number; retryDelayMs?: number } = {}
): Promise<WriteResult> {
  const { overwrite = true, timeoutMs = 20000, maxAttempts = 3, retryDelayMs = 300 } = opts;
  const reader = requireReader();
  const { controller, release } = await acquire();
  linkSignal(controller, opts.signal);
  const releaseWake = await holdWakeLock();
  const timer = setTimeout(() => controller.abort(timeoutError(timeoutMs)), timeoutMs);
  const start = nfcEnv.now();

  try {
    for (let attempt = 1; ; attempt++) {
      // Superseded (or timed out) before reaching write(): never start a write that
      // nothing can cancel, it would hold the NFC lock forever.
      if (controller.signal.aborted) throw controller.signal.reason;
      try {
        await reader.write({ records }, { signal: controller.signal, overwrite });
        return { attemptsUsed: attempt, elapsedMs: nfcEnv.now() - start };
      } catch (e) {
        if (controller.signal.aborted) throw controller.signal.reason ?? e;
        const transient = (e as any)?.name === "NetworkError" && describeNfcError(e).code === "io";
        if (!transient || attempt >= maxAttempts) throw e;
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
    releaseWake();
    release();
  }
}

/** Replaces the tag's contents with a single empty record. */
export function eraseTag(opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<WriteResult> {
  return writeTag([{ recordType: "empty" }], { ...opts, overwrite: true });
}

/** PERMANENT: makes the tag read-only. Only offered in the lab, behind a confirmation. */
export async function makeTagReadOnly(opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<{ elapsedMs: number }> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const reader = requireReader();
  if (typeof reader.makeReadOnly !== "function") {
    throw new NfcOperationError({ code: "unsupported", raw: "makeReadOnly is not available", hint: "This Chrome version cannot lock tags (needs Chrome 100+)." });
  }
  const { controller, release } = await acquire();
  linkSignal(controller, opts.signal);
  const releaseWake = await holdWakeLock();
  const timer = setTimeout(() => controller.abort(timeoutError(timeoutMs)), timeoutMs);
  const start = nfcEnv.now();
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    await reader.makeReadOnly({ signal: controller.signal });
    return { elapsedMs: nfcEnv.now() - start };
  } catch (e) {
    throw controller.signal.aborted ? controller.signal.reason ?? e : e;
  } finally {
    clearTimeout(timer);
    controller.abort();
    releaseWake();
    release();
  }
}

/**
 * Chrome rejects write({overwrite:false}) on a non-empty tag with the same
 * NotAllowedError name it uses for a refused permission, and the message wording
 * is not specified. If the NFC permission is already granted, a NotAllowedError
 * from such a write can only mean the tag holds data, so classify it as such.
 */
export async function describeWriteError(e: unknown, overwrite: boolean): Promise<NfcFailure> {
  const failure = describeNfcError(e);
  if (!overwrite && failure.code === "permission" && (await getNfcPermission()) === "granted") {
    return {
      code: "not-empty",
      raw: failure.raw,
      hint: "The tag already holds data and overwrite was not allowed. Use Overwrite, or Erase the tag first.",
    };
  }
  return failure;
}
