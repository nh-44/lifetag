import { useEffect, useMemo, useRef, useState } from "react";
import {
  getNfcSupport, getNfcPermission, canMakeReadOnly, cancelNfcOperation, makeTagReadOnly, describeNfcError,
} from "@/lib/webNfc";
import { encodeTag, decodeTagMessage, TAG_CAPACITY_BYTES, TagModel, TagFormat } from "@/lib/tagCodec";
import { NfcCryptoService } from "@/services/nfcCryptoService";
import {
  FACTORS, FactorKey, Condition, DEFAULT_CONDITION, TRIAL_TYPES, TrialType, LabTrial, LAB_VERSION, PlanStep,
  buildPlan, summarize, toCsv,
} from "@/lib/nfcLab";
import { runLabTrial, buildLabPayload, writeTamperedTag } from "@/lib/nfcLabRunner";
import { runScanPathLatency, measureTimerResolutionMs } from "@/lib/scanPathLatency";

/**
 * NFC Lab — the physical-trial test suite (route /bench/nfc). Not patient-facing.
 * Every trial runs the same Web NFC + codec code the production writer/scanner use,
 * records its full condition, and is kept in localStorage until exported.
 * See NFC_PROTOCOL.md for the procedure.
 */

const TRIALS_KEY = "aegistag_nfc_lab_v2";
const PLAN_KEY = "aegistag_nfc_lab_plan";
const SESSION_KEY = "aegistag_nfc_lab_session";

interface DeviceInfo { model: string; androidVersion: string; chromeVersion: string }

async function detectDeviceInfo(): Promise<DeviceInfo> {
  const ua = navigator.userAgent;
  let model = "";
  try {
    const hints = await (navigator as any).userAgentData?.getHighEntropyValues?.(["model"]);
    if (hints?.model) model = hints.model;
  } catch { /* manual entry */ }
  return { model, androidVersion: ua.match(/Android ([\d.]+)/)?.[1] ?? "", chromeVersion: ua.match(/Chrome\/([\d.]+)/)?.[1] ?? "" };
}

const load = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const download = (content: string, filename: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const ms = (x: number | null) => (x == null ? "–" : `${Math.round(x)}`);

const SUMMARY_KEYS: Array<keyof LabTrial> = ["trialType", "format", "profile", "distanceCm", "orientation", "medium", "placement", "tagModel"];

const BenchNfc = () => {
  const [device, setDevice] = useState<DeviceInfo>({ model: "", androidVersion: "", chromeVersion: "" });
  const [env, setEnv] = useState<Record<string, string>>({});
  const [session, setSession] = useState(() =>
    load(SESSION_KEY, { sessionId: `S${Date.now().toString(36)}`, tagModel: "NTAG216" as TagModel | string, tagLabel: "Tag A", note: "", tagCostInr: "" })
  );
  const [condition, setCondition] = useState<Condition>(DEFAULT_CONDITION);
  const [trialType, setTrialType] = useState<TrialType>("read-after-write");
  const [trials, setTrials] = useState<LabTrial[]>(() => load(TRIALS_KEY, []));
  const [plan, setPlan] = useState<{ steps: PlanStep[]; pos: number; seed: number } | null>(() => load(PLAN_KEY, null));
  const [varied, setVaried] = useState<Partial<Record<FactorKey, string[]>>>({ distanceCm: ["0", "1", "2", "3"] });
  const [planTypes, setPlanTypes] = useState<TrialType[]>(["read", "read-after-write"]);
  const [reps, setReps] = useState(10);
  const [groupBy, setGroupBy] = useState<Array<keyof LabTrial>>(["trialType", "format", "distanceCm"]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [selfTest, setSelfTest] = useState<Array<Record<string, string>> | null>(null);
  const [latency, setLatency] = useState<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const support = useMemo(getNfcSupport, []);

  useEffect(() => {
    detectDeviceInfo().then(setDevice);
    (async () => {
      setEnv({
        "Secure context (HTTPS)": window.isSecureContext ? "yes" : "NO — open the https:// URL",
        "Web NFC": support.supported ? "available" : support.message,
        "NFC permission": await getNfcPermission(),
        "makeReadOnly": canMakeReadOnly() ? "supported" : "not supported",
        "Screen wake lock": "wakeLock" in navigator ? "supported" : "not supported (keep the screen on manually)",
        "Cross-origin isolated": typeof crossOriginIsolated !== "undefined" && crossOriginIsolated ? "yes" : "no (timer coarsened)",
        "Timer resolution": `${measureTimerResolutionMs()} ms`,
      });
    })();
  }, [support]);

  useEffect(() => localStorage.setItem(TRIALS_KEY, JSON.stringify(trials)), [trials]);
  useEffect(() => localStorage.setItem(PLAN_KEY, JSON.stringify(plan)), [plan]);
  useEffect(() => localStorage.setItem(SESSION_KEY, JSON.stringify(session)), [session]);

  const runTrial = async (type: TrialType, cond: Condition, planStep: number | null) => {
    if (running) return; // one operation at a time; a second press used to cancel the first write
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const spec = TRIAL_TYPES[type];
    setStatus(
      cond.placement.startsWith("resting")
        ? `Tag should already be in position (${spec.needs}). Waiting…`
        : `Now bring ${spec.needs} to the phone and hold it still…`
    );
    try {
      const outcome = await runLabTrial(type, cond, { timeoutMs: 20000, signal: controller.signal, onPrompt: setStatus });
      const trial: LabTrial = {
        ...cond,
        ...outcome,
        labVersion: LAB_VERSION,
        id: `${session.sessionId}-${Date.now().toString(36)}`,
        sessionId: session.sessionId,
        planStep,
        trialType: type,
        expected: spec.expected,
        tagModel: session.tagModel,
        tagLabel: session.tagLabel,
        deviceModel: device.model,
        androidVersion: device.androidVersion,
        chromeVersion: device.chromeVersion,
        note: session.note,
        timestamp: new Date().toISOString(),
      };
      setTrials((prev) => [...prev, trial]);
      setStatus(
        `${trial.outcomeMatched ? "✅ PASS" : "❌ FAIL"} — ${spec.label}` +
        (trial.nfcMs != null ? `, ${Math.round(trial.nfcMs)} ms` : "") +
        (trial.attemptsUsed && trial.attemptsUsed > 1 ? `, ${trial.attemptsUsed} attempts` : "") +
        (trial.errorCode ? ` — ${trial.errorCode}: ${trial.errorRaw}` : "")
      );
      if (planStep != null) setPlan((p) => (p ? { ...p, pos: Math.max(p.pos, planStep + 1) } : p));
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  };

  const cancel = () => {
    abortRef.current?.abort(new DOMException("Cancelled by operator", "AbortError"));
    cancelNfcOperation();
  };

  const runSelfTest = async () => {
    setStatus("Running codec/crypto self-test (no tag needed)…");
    const rows: Array<Record<string, string>> = [];
    for (const profile of FACTORS.profile.levels) {
      for (const format of ["v3-binary", "v1-text"] as TagFormat[]) {
        try {
          const payload = await buildLabPayload(profile);
          const enc = await encodeTag(payload, format);
          const msg = { records: enc.records.map((r) => r.recordType === "text"
            ? { recordType: "text", encoding: "utf-8", data: new DataView(new TextEncoder().encode(r.data as string).buffer) }
            : { recordType: r.recordType, data: new DataView(r.data as ArrayBuffer) }) };
          const decoded = await decodeTagMessage(msg);
          const verified = (await NfcCryptoService.verifyTagIntegrity(decoded.payload)).verified;
          rows.push({
            profile, format, bytes: String(enc.tagBytes),
            ...Object.fromEntries((Object.keys(TAG_CAPACITY_BYTES) as TagModel[]).map((m) => [m, enc.tagBytes <= TAG_CAPACITY_BYTES[m] ? "fits" : "—"])),
            roundTrip: verified ? "OK" : "FAIL",
          });
        } catch (e) {
          rows.push({ profile, format, bytes: "", roundTrip: `ERROR ${e instanceof Error ? e.message : e}` });
        }
      }
    }
    setSelfTest(rows);
    setStatus(rows.every((r) => r.roundTrip === "OK") ? "Self-test passed." : "Self-test found problems — see table.");
  };

  const runLatency = async () => {
    setRunning(true);
    setStatus("Running scan-path compute benchmark (≈15 s)…");
    try {
      setLatency(await runScanPathLatency(device));
      setStatus("Latency benchmark complete.");
    } finally {
      setRunning(false);
    }
  };

  const prepareTamperedTag = async () => {
    setRunning(true);
    setStatus("Setup: hold a tag to write a TAMPERED payload (for tamper-read trials)…");
    try {
      await writeTamperedTag(condition, { timeoutMs: 20000 });
      setStatus("Tampered tag written. Now run Tampered tag (must reject) trials with it.");
    } catch (e) {
      setStatus(describeNfcError(e).hint);
    } finally {
      setRunning(false);
    }
  };

  const lockTag = async () => {
    if (!window.confirm("PERMANENT: this makes the tag read-only forever. It can never be re-issued. Continue?")) return;
    setRunning(true);
    setStatus("Hold the tag to lock it…");
    try {
      await makeTagReadOnly();
      setStatus("Tag is now read-only.");
    } catch (e) {
      setStatus(describeNfcError(e).hint);
    } finally {
      setRunning(false);
    }
  };

  const summary = useMemo(() => summarize(trials, groupBy), [trials, groupBy]);
  const nextStep = plan && plan.pos < plan.steps.length ? plan.steps[plan.pos] : null;

  const select = (key: FactorKey) => (
    <label key={key} className="text-sm flex flex-col">
      {FACTORS[key].label}
      <select className="border rounded px-2 py-1" value={condition[key]} onChange={(e) => setCondition({ ...condition, [key]: e.target.value })}>
        {FACTORS[key].levels.map((l) => <option key={l} value={l}>{key === "distanceCm" ? `${l} cm` : l}</option>)}
      </select>
    </label>
  );

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5">
      <h1 className="text-2xl font-bold">NFC Lab — physical trial suite</h1>
      <p className="text-sm text-slate-600">Not patient-facing. Trials are stored on this device until you export them. Procedure: NFC_PROTOCOL.md.</p>

      {/* Environment */}
      <section className="border rounded p-3 space-y-2">
        <h2 className="font-semibold">1. Environment</h2>
        <table className="text-sm w-full"><tbody>
          {Object.entries(env).map(([k, v]) => (
            <tr key={k}><td className="pr-3 text-slate-500 align-top">{k}</td><td className={/NO|not available|denied/i.test(v) ? "text-red-700" : ""}>{v}</td></tr>
          ))}
        </tbody></table>
        <button className="border px-3 py-1 rounded" onClick={runSelfTest} disabled={running}>Run self-test (no tag)</button>
        {selfTest && (
          <table className="text-xs w-full border mt-2">
            <thead><tr>{Object.keys(selfTest[0]).map((k) => <th key={k} className="border px-1">{k}</th>)}</tr></thead>
            <tbody>{selfTest.map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <td key={j} className="border px-1">{v}</td>)}</tr>)}</tbody>
          </table>
        )}
      </section>

      {/* Session */}
      <section className="border rounded p-3 grid grid-cols-2 gap-2 text-sm">
        <h2 className="font-semibold col-span-2">2. Session</h2>
        <label className="flex flex-col">Device model<input className="border px-2 py-1" value={device.model} onChange={(e) => setDevice({ ...device, model: e.target.value })} placeholder="e.g. CPH2487" /></label>
        <label className="flex flex-col">Android / Chrome<input className="border px-2 py-1" value={`${device.androidVersion} / ${device.chromeVersion}`} readOnly /></label>
        <label className="flex flex-col">Tag model
          <select className="border px-2 py-1" value={session.tagModel} onChange={(e) => setSession({ ...session, tagModel: e.target.value })}>
            {Object.keys(TAG_CAPACITY_BYTES).map((m) => <option key={m}>{m}</option>)}
            <option>other</option>
          </select>
        </label>
        <label className="flex flex-col">Tag label (which physical tag)<input className="border px-2 py-1" value={session.tagLabel} onChange={(e) => setSession({ ...session, tagLabel: e.target.value })} /></label>
        <label className="flex flex-col col-span-2">Note<input className="border px-2 py-1" value={session.note} onChange={(e) => setSession({ ...session, note: e.target.value })} placeholder="anything unusual about this session" /></label>
        <label className="flex flex-col">Tag unit cost (₹)<input className="border px-2 py-1" value={session.tagCostInr} onChange={(e) => setSession({ ...session, tagCostInr: e.target.value })} /></label>
      </section>

      {/* Single trial */}
      <section className="border rounded p-3 space-y-2">
        <h2 className="font-semibold">3. Single trial</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{(Object.keys(FACTORS) as FactorKey[]).map(select)}</div>
        <label className="text-sm flex flex-col">Trial type
          <select className="border rounded px-2 py-1" value={trialType} onChange={(e) => setTrialType(e.target.value as TrialType)}>
            {(Object.keys(TRIAL_TYPES) as TrialType[]).map((t) => <option key={t} value={t}>{TRIAL_TYPES[t].label} — needs {TRIAL_TYPES[t].needs}</option>)}
          </select>
        </label>
        <div className="flex gap-2 flex-wrap">
          <button className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50" disabled={running || !support.supported} onClick={() => runTrial(trialType, condition, null)}>Run trial</button>
          <button className="border px-4 py-2 rounded disabled:opacity-50" disabled={!running} onClick={cancel}>Cancel</button>
          <button className="border px-3 py-2 rounded text-sm disabled:opacity-50" disabled={running || !support.supported} onClick={prepareTamperedTag}>Setup: write tampered tag</button>
          <button className="border border-red-300 text-red-700 px-3 py-2 rounded text-sm disabled:opacity-50" disabled={running || !canMakeReadOnly()} onClick={lockTag}>Lock tag read-only…</button>
        </div>
      </section>

      {/* Planned run */}
      <section className="border rounded p-3 space-y-2">
        <h2 className="font-semibold">4. Planned run (randomized full factorial)</h2>
        <p className="text-xs text-slate-500">Tick the levels to vary; unticked factors use the single-trial settings above. Order is randomized so tag wear or fatigue is not confounded with any condition.</p>
        {(Object.keys(FACTORS) as FactorKey[]).map((key) => (
          <div key={key} className="text-sm">
            <span className="font-medium mr-2">{FACTORS[key].label}:</span>
            {FACTORS[key].levels.map((l) => (
              <label key={l} className="mr-3 whitespace-nowrap">
                <input type="checkbox" checked={!!varied[key]?.includes(l)}
                  onChange={(e) => setVaried({ ...varied, [key]: e.target.checked ? [...(varied[key] || []), l] : (varied[key] || []).filter((x) => x !== l) })} />{" "}
                {key === "distanceCm" ? `${l} cm` : l}
              </label>
            ))}
          </div>
        ))}
        <div className="text-sm">
          <span className="font-medium mr-2">Trial types:</span>
          {(Object.keys(TRIAL_TYPES) as TrialType[]).map((t) => (
            <label key={t} className="mr-3 whitespace-nowrap">
              <input type="checkbox" checked={planTypes.includes(t)} onChange={(e) => setPlanTypes(e.target.checked ? [...planTypes, t] : planTypes.filter((x) => x !== t))} /> {TRIAL_TYPES[t].label}
            </label>
          ))}
        </div>
        <label className="text-sm">Repetitions per cell <input type="number" min={1} className="border w-16 px-1" value={reps} onChange={(e) => setReps(Math.max(1, Number(e.target.value) || 1))} /></label>
        <div>
          <button className="border px-3 py-1 rounded" onClick={() => {
            const seed = Math.floor(Math.random() * 1e9);
            setPlan({ steps: buildPlan(varied, condition, planTypes, reps, seed), pos: 0, seed });
          }}>Generate plan</button>
          {plan && <button className="border px-3 py-1 rounded ml-2 text-red-700" onClick={() => setPlan(null)}>Discard plan</button>}
        </div>
        {plan && (
          <div className="bg-slate-50 rounded p-2 text-sm space-y-1">
            <p>Step {Math.min(plan.pos + 1, plan.steps.length)} of {plan.steps.length} (seed {plan.seed})</p>
            <div className="w-full bg-slate-200 h-2 rounded"><div className="bg-blue-600 h-2 rounded" style={{ width: pct(plan.pos / plan.steps.length) }} /></div>
            {nextStep ? (
              <>
                <p className="font-medium">Next: {TRIAL_TYPES[nextStep.trialType].label} — use {TRIAL_TYPES[nextStep.trialType].needs}</p>
                <p>Set up: {nextStep.condition.distanceCm} cm, {nextStep.condition.orientation}, {nextStep.condition.medium}, {nextStep.condition.placement}; payload {nextStep.condition.profile}, {nextStep.condition.format}</p>
                <div className="flex gap-2">
                  <button className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50" disabled={running || !support.supported} onClick={() => runTrial(nextStep.trialType, nextStep.condition, nextStep.index)}>Run step</button>
                  <button className="border px-3 py-2 rounded" disabled={running} onClick={() => setPlan({ ...plan, pos: plan.pos + 1 })}>Skip</button>
                </div>
              </>
            ) : <p className="font-medium text-green-700">Plan complete. Export the results below.</p>}
          </div>
        )}
      </section>

      <p className="text-sm min-h-[1.5em] font-medium" data-testid="lab-status">{status}</p>

      {/* Results */}
      <section className="border rounded p-3 space-y-2">
        <h2 className="font-semibold">5. Results ({trials.length} trials, {trials.filter((t) => t.outcomeMatched).length} passed)</h2>
        <div className="text-xs">
          Group by:{" "}
          {SUMMARY_KEYS.map((k) => (
            <label key={k} className="mr-2"><input type="checkbox" checked={groupBy.includes(k)} onChange={(e) => setGroupBy(e.target.checked ? [...groupBy, k] : groupBy.filter((g) => g !== k))} /> {k}</label>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs w-full border">
            <thead><tr>{[...groupBy, "n", "pass", "95% CI", "median ms", "p95 ms", "attempts", "top error"].map((h) => <th key={String(h)} className="border px-1">{String(h)}</th>)}</tr></thead>
            <tbody>
              {summary.map((r, i) => (
                <tr key={i}>
                  {groupBy.map((g) => <td key={String(g)} className="border px-1">{r.key[g as string]}</td>)}
                  <td className="border px-1">{r.n}</td>
                  <td className="border px-1">{r.matched}/{r.n} ({pct(r.rate)})</td>
                  <td className="border px-1">{pct(r.ci95[0])}–{pct(r.ci95[1])}</td>
                  <td className="border px-1">{ms(r.medianNfcMs)}</td>
                  <td className="border px-1">{ms(r.p95NfcMs)}</td>
                  <td className="border px-1">{r.meanAttempts?.toFixed(2) ?? "–"}</td>
                  <td className="border px-1">{r.topError}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="border px-3 py-1 rounded" onClick={() => download(toCsv(trials), `nfc-lab-${session.sessionId}.csv`, "text/csv")}>Export CSV</button>
          <button className="border px-3 py-1 rounded" onClick={() => download(JSON.stringify({ session, device, env, groupBy, summary }, null, 2), `nfc-lab-summary-${session.sessionId}.json`, "application/json")}>Export summary JSON</button>
          <button className="border px-3 py-1 rounded text-red-700" onClick={() => window.confirm("Delete all recorded trials on this device?") && setTrials([])}>Clear trials</button>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer">Last 15 trials</summary>
          <ul className="font-mono">
            {trials.slice(-15).reverse().map((t) => (
              <li key={t.id}>{t.outcomeMatched ? "PASS" : "FAIL"} {t.trialType} {t.format} {t.distanceCm}cm {t.orientation} {t.medium} {ms(t.nfcMs)}ms {t.errorCode}</li>
            ))}
          </ul>
        </details>
      </section>

      {/* Compute latency */}
      <section className="border rounded p-3 space-y-2">
        <h2 className="font-semibold">6. On-device scan-path compute benchmark</h2>
        <button className="bg-purple-600 text-white px-4 py-2 rounded disabled:opacity-50" disabled={running} onClick={runLatency}>Run benchmark (no tag)</button>
        {latency && (
          <>
            <pre className="text-xs bg-slate-100 p-2 overflow-auto max-h-64">{JSON.stringify(latency, null, 2)}</pre>
            <button className="border px-3 py-1 rounded" onClick={() => download(JSON.stringify(latency, null, 2), "crypto-latency-mobile.json", "application/json")}>Download crypto-latency-mobile.json</button>
          </>
        )}
      </section>
    </div>
  );
};

export default BenchNfc;
