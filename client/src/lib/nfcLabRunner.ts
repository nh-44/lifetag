/**
 * Executes one NFC Lab trial against a real tag and returns its measured record.
 * Each trial type encodes what "success" means for it (see TRIAL_TYPES): reject
 * trials (protect-check, tamper-read) succeed only when the system refuses for
 * the right reason, so a timeout or blank tag never counts as a correct rejection.
 */
import { NfcCryptoService } from "@/services/nfcCryptoService";
import { NfcTagPayload } from "@/types";
import { readTagOnce, writeTag, eraseTag, describeNfcError, describeWriteError, NfcFailure } from "@/lib/webNfc";
import { encodeTag, decodeTagMessage, sameContent, TagDecodeError, TagFormat } from "@/lib/tagCodec";
import { Condition, TrialType, TRIAL_TYPES, PROFILES, LAB_PATIENT_ID } from "@/lib/nfcLab";

let labAuthority: Promise<CryptoKeyPair> | null = null;

/**
 * Lab tags carry a real-size authority certificate signed by a throwaway key held
 * only in this page, so byte counts and Tier 2 compute match production without
 * the lab needing a doctor login or the production authority key.
 */
async function labCertify(publicKey: { x: string; y: string }, issuedAt: number): Promise<string> {
  labAuthority ||= crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]) as Promise<CryptoKeyPair>;
  const { privateKey } = await labAuthority;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(NfcCryptoService.certSigningString(LAB_PATIENT_ID, issuedAt, publicKey.x, publicKey.y))
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export function buildLabPayload(profile: string): Promise<NfcTagPayload> {
  return NfcCryptoService.generateTagPayload({ ...PROFILES[profile], fhirPatientId: LAB_PATIENT_ID }, labCertify);
}

export interface TrialOutcome {
  opSucceeded: boolean;
  outcomeMatched: boolean;
  errorCode: string;
  errorRaw: string;
  attemptsUsed: number | null;
  nfcMs: number | null;
  decodeVerifyMs: number | null;
  readBackMs: number | null;
  readBackMatched: boolean | null;
  tagBytes: number | null;
  detectedFormat: string;
  serialNumber: string;
}

const blank = (): TrialOutcome => ({
  opSucceeded: false, outcomeMatched: false, errorCode: "", errorRaw: "", attemptsUsed: null, nfcMs: null,
  decodeVerifyMs: null, readBackMs: null, readBackMatched: null, tagBytes: null, detectedFormat: "", serialNumber: "",
});

const withFailure = (o: TrialOutcome, f: NfcFailure): TrialOutcome => ({ ...o, errorCode: f.code, errorRaw: f.raw });

export interface RunOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Called with operator instructions between the two taps of write+read-back trials. */
  onPrompt?: (message: string) => void;
}

/** Read, decode, verify. Returns null fields for anything not reached. */
async function readAndVerify(opts: RunOptions) {
  const read = await readTagOnce({ timeoutMs: opts.timeoutMs, signal: opts.signal });
  const t0 = performance.now();
  try {
    const decoded = await decodeTagMessage(read.message);
    const verification = decoded.payload.isUnsigned
      ? { verified: false, trustedAuthority: false, error: "Unsigned tag" }
      : await NfcCryptoService.verifyTagIntegrity(decoded.payload);
    return { read, decoded, verification, decodeVerifyMs: performance.now() - t0, decodeError: null as TagDecodeError | null };
  } catch (e) {
    const decodeError = e instanceof TagDecodeError ? e : new TagDecodeError("corrupt", String(e));
    return { read, decoded: null, verification: null, decodeVerifyMs: performance.now() - t0, decodeError };
  }
}

export async function runLabTrial(trialType: TrialType, condition: Condition, opts: RunOptions = {}): Promise<TrialOutcome> {
  const out = blank();
  const expected = TRIAL_TYPES[trialType].expected;

  try {
    if (trialType === "read" || trialType === "tamper-read") {
      const r = await readAndVerify(opts);
      out.nfcMs = r.read.elapsedMs;
      out.serialNumber = r.read.serialNumber;
      out.decodeVerifyMs = r.decodeVerifyMs;
      out.detectedFormat = r.decoded?.format ?? "";
      out.tagBytes = r.decoded?.contentBytes ?? null;
      const accepted = !!r.verification?.verified;
      out.opSucceeded = true;
      if (r.decodeError) {
        out.errorCode = r.decodeError.reason === "empty" ? "blank-tag" : `decode-${r.decodeError.reason}`;
        out.errorRaw = r.decodeError.message;
      } else if (!accepted) {
        out.errorCode = "verify-failed";
        out.errorRaw = r.verification?.error || "";
      }
      // A blank tag is a setup mistake, not a detected tamper.
      const detectedTamper = !accepted && out.errorCode !== "blank-tag";
      out.outcomeMatched = expected === "accept" ? accepted : detectedTamper;
      return out;
    }

    if (trialType === "erase") {
      const w = await eraseTag({ timeoutMs: opts.timeoutMs, signal: opts.signal });
      Object.assign(out, { opSucceeded: true, attemptsUsed: w.attemptsUsed, nfcMs: w.elapsedMs });
      opts.onPrompt?.("Erased. Keep the tag in place (or tap again) to confirm it is blank…");
      const t0 = performance.now();
      const read = await readTagOnce({ timeoutMs: opts.timeoutMs, signal: opts.signal });
      out.readBackMs = performance.now() - t0;
      out.serialNumber = read.serialNumber;
      out.readBackMatched = await decodeTagMessage(read.message).then(() => false, (e) => e instanceof TagDecodeError && e.reason === "empty");
      out.outcomeMatched = out.readBackMatched;
      if (!out.readBackMatched) out.errorCode = "erase-not-blank";
      return out;
    }

    // Write-type trials
    const encoded = await encodeTag(await buildLabPayload(condition.profile), condition.format as TagFormat);
    out.tagBytes = encoded.tagBytes;
    out.detectedFormat = encoded.format;
    const overwrite = trialType === "overwrite" || trialType === "read-after-write";

    try {
      const w = await writeTag(encoded.records, { overwrite, timeoutMs: opts.timeoutMs, signal: opts.signal });
      Object.assign(out, { opSucceeded: true, attemptsUsed: w.attemptsUsed, nfcMs: w.elapsedMs });
    } catch (e) {
      const f = await describeWriteError(e, overwrite);
      // protect-check passes only when the write is refused BECAUSE the tag holds data.
      return { ...withFailure(out, f), outcomeMatched: trialType === "protect-check" && f.code === "not-empty" };
    }

    if (trialType === "protect-check") {
      return { ...out, outcomeMatched: false, errorCode: "protection-bypassed", errorRaw: "Write with overwrite:false succeeded (tag was blank, or protection failed)" };
    }
    if (trialType === "write-blank") {
      return { ...out, outcomeMatched: true };
    }

    opts.onPrompt?.("Written. Keep the tag in place (or tap again) for read-back…");
    const t0 = performance.now();
    const read = await readTagOnce({ timeoutMs: opts.timeoutMs, signal: opts.signal });
    out.readBackMs = performance.now() - t0;
    out.serialNumber = read.serialNumber;
    out.readBackMatched = sameContent(encoded, read.message);
    out.outcomeMatched = out.readBackMatched;
    if (!out.readBackMatched) out.errorCode = "readback-mismatch";
    return out;
  } catch (e) {
    return withFailure(out, describeNfcError(e));
  }
}

/**
 * Setup helper for tamper-read trials: writes a validly signed payload whose
 * clinical content (blood group) was altered AFTER signing, exactly what an
 * attacker editing a tag with another app produces. Not itself a trial.
 */
export async function writeTamperedTag(condition: Condition, opts: RunOptions = {}): Promise<void> {
  const payload = await buildLabPayload(condition.profile);
  const tampered = { ...payload, triageData: { ...payload.triageData, bloodGroup: payload.triageData.bloodGroup === "AB-Positive" ? "O-Negative" : "AB-Positive" } };
  const encoded = await encodeTag(tampered, condition.format as TagFormat);
  await writeTag(encoded.records, { overwrite: true, timeoutMs: opts.timeoutMs, signal: opts.signal });
}
