import { useEffect, useState } from "react";
import { NfcCryptoService } from "@/services/nfcCryptoService";

/**
 * Phase 5 (+ the mobile halves of Phase 3 and Phase 6) data-collection page.
 * Not part of the patient-facing product — a QA/benchmark tool for physically
 * measuring what only a real Android+Chrome device and a real NTAG21x tag
 * can produce: NFC read/write handshake latency across distance/orientation/
 * material conditions, Web Crypto latency on real mobile hardware, and the
 * true tap-to-rendered-on-screen time for the signed verification path.
 * See NFC_PROTOCOL.md for how to reach this page on a phone and the
 * recommended trial plan.
 */

const DISTANCES = ["0.5cm", "1cm", "2cm", "3cm", "4cm"] as const;
const ORIENTATIONS = ["coplanar", "45deg", "perpendicular"] as const;
const MATERIALS = ["bare", "phone case", "fabric"] as const;

interface NfcTrial {
  trialType: "read" | "write";
  distance: string;
  orientation: string;
  material: string;
  success: boolean;
  retryCount: number;
  handshakeMs: number | null; // tap -> payload available (read) / tap -> write complete (write)
  tapToRenderMs: number | null; // read only: tap -> full verification + DOM commit
  timestamp: string;
}

interface DeviceInfo {
  model: string;
  androidVersion: string;
  chromeVersion: string;
  manuallyEntered: boolean;
}

interface LatencyStats {
  n: number; meanMs: number; medianMs: number; stdDevMs: number; minMs: number; maxMs: number; p95Ms: number;
}

function computeStats(samples: number[]): LatencyStats {
  const n = samples.length;
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2];
  const p95Index = Math.min(n - 1, Math.ceil(0.95 * n) - 1);
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return { n, meanMs: round(mean), medianMs: round(median), stdDevMs: round(Math.sqrt(variance)), minMs: round(sorted[0]), maxMs: round(sorted[n - 1]), p95Ms: round(sorted[p95Index]) };
}

async function detectDeviceInfo(): Promise<DeviceInfo> {
  const ua = navigator.userAgent;
  const chromeMatch = ua.match(/Chrome\/([\d.]+)/);
  const androidMatch = ua.match(/Android ([\d.]+)/);
  let model = "unknown (enter manually)";
  try {
    // @ts-ignore - Chrome-only User-Agent Client Hints API
    if (navigator.userAgentData?.getHighEntropyValues) {
      // @ts-ignore
      const hints = await navigator.userAgentData.getHighEntropyValues(["model", "platformVersion"]);
      if (hints.model) model = hints.model;
    }
  } catch { /* fall through to manual entry */ }

  return {
    model,
    androidVersion: androidMatch?.[1] ?? "unknown (enter manually)",
    chromeVersion: chromeMatch?.[1] ?? "unknown (enter manually)",
    manuallyEntered: false,
  };
}

const BenchNfc = () => {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({ model: "", androidVersion: "", chromeVersion: "", manuallyEntered: false });
  const [distance, setDistance] = useState<string>(DISTANCES[1]);
  const [orientation, setOrientation] = useState<string>(ORIENTATIONS[0]);
  const [material, setMaterial] = useState<string>(MATERIALS[0]);
  const [retryCount, setRetryCount] = useState(0);
  const [trials, setTrials] = useState<NfcTrial[]>([]);
  const [status, setStatus] = useState("");
  const [isNfcSupported, setIsNfcSupported] = useState<boolean | null>(null);
  const [tagCostInr, setTagCostInr] = useState("");
  const [cryptoResult, setCryptoResult] = useState<any>(null);
  const [cryptoRunning, setCryptoRunning] = useState(false);

  useEffect(() => {
    detectDeviceInfo().then(setDeviceInfo);
    // @ts-ignore
    setIsNfcSupported(typeof NDEFReader !== "undefined");
    const saved = localStorage.getItem("bench_nfc_trials");
    if (saved) {
      try { setTrials(JSON.parse(saved)); } catch { /* ignore corrupt local cache */ }
    }
  }, []);

  const persist = (next: NfcTrial[]) => {
    setTrials(next);
    localStorage.setItem("bench_nfc_trials", JSON.stringify(next));
  };

  const recordTrial = (trial: NfcTrial) => persist([...trials, trial]);

  const runReadTrial = async () => {
    setStatus("Hold a written test tag near the device now...");
    try {
      // @ts-ignore
      const ndef = new NDEFReader();
      const controller = new AbortController();
      const tapStart = performance.now();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { controller.abort(); reject(new Error("Timed out waiting for tap (10s)")); }, 10000);

        ndef.addEventListener("reading", async (event: any) => {
          const handshakeMs = performance.now() - tapStart;
          try {
            let payload: any = null;
            for (const record of event.message.records) {
              if (record.recordType === "text") {
                const decoder = new TextDecoder(record.encoding || "utf-8");
                const text = decoder.decode(record.data);
                if (text.startsWith("gzip:")) {
                  const bytes = Uint8Array.from(atob(text.slice(5)), (c) => c.charCodeAt(0));
                  payload = await NfcCryptoService.decompressPayload(bytes);
                }
              }
            }
            if (payload) await NfcCryptoService.verifyTagIntegrity(payload); // Tier 1 (+ Tier 2 if authority-signed)

            // Commit to DOM and wait one animation frame to approximate paint completion —
            // this is the closest a web page can get to "rendered on screen" without a
            // native profiler.
            setStatus(`Rendered: ${payload?.triageData?.name ?? "(no payload)"}`);
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            const tapToRenderMs = performance.now() - tapStart;

            clearTimeout(timeout);
            controller.abort();
            recordTrial({ trialType: "read", distance, orientation, material, success: true, retryCount, handshakeMs, tapToRenderMs, timestamp: new Date().toISOString() });
            resolve();
          } catch (e) {
            clearTimeout(timeout);
            reject(e);
          }
        });
        ndef.addEventListener("error", (e: any) => { clearTimeout(timeout); reject(e); });
        // @ts-ignore - the installed Web NFC type defs don't model NDEFScanOptions
        ndef.scan({ signal: controller.signal }).catch(reject);
      });
      setStatus("Read trial recorded.");
    } catch (e: any) {
      recordTrial({ trialType: "read", distance, orientation, material, success: false, retryCount, handshakeMs: null, tapToRenderMs: null, timestamp: new Date().toISOString() });
      setStatus(`Read trial FAILED: ${e.message}`);
    }
  };

  const runWriteTrial = async () => {
    setStatus("Hold a blank/rewritable test tag near the device now...");
    try {
      const payload = await NfcCryptoService.generateTagPayload({
        name: "Bench Test Patient", bloodGroup: "O-Positive", allergies: ["Penicillin"],
        emergencyContacts: [{ userId: "+919876543210", name: "Test Contact" }],
        dnrStatus: false, fhirPatientId: "90099",
      });
      const compressed = await NfcCryptoService.compressPayload(payload);
      let binary = "";
      for (let i = 0; i < compressed.length; i++) binary += String.fromCharCode(compressed[i]);
      const text = `gzip:${btoa(binary)}`;

      // @ts-ignore
      const ndef = new NDEFReader();
      const tapStart = performance.now();
      await ndef.write({ records: [{ recordType: "text", data: text, lang: "en" }] });
      const handshakeMs = performance.now() - tapStart;

      recordTrial({ trialType: "write", distance, orientation, material, success: true, retryCount, handshakeMs, tapToRenderMs: null, timestamp: new Date().toISOString() });
      setStatus(`Write trial recorded (${handshakeMs.toFixed(1)} ms).`);
    } catch (e: any) {
      recordTrial({ trialType: "write", distance, orientation, material, success: false, retryCount, handshakeMs: null, tapToRenderMs: null, timestamp: new Date().toISOString() });
      setStatus(`Write trial FAILED: ${e.message}`);
    }
  };

  const runMobileCryptoLatency = async () => {
    setCryptoRunning(true);
    setStatus("Running Web Crypto latency benchmark (100 iterations x 7 ops)...");
    const WARMUP = 20, MEASURED = 100;
    const time = async (fn: () => Promise<void>) => {
      const samples: number[] = [];
      for (let i = 0; i < WARMUP + MEASURED; i++) {
        const t0 = performance.now();
        await fn();
        const t1 = performance.now();
        if (i >= WARMUP) samples.push(t1 - t0);
      }
      return computeStats(samples);
    };

    const patientKeyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const authorityKeyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const triageDataBytes = new TextEncoder().encode(JSON.stringify({ name: "John Doe", bloodGroup: "O-Negative", allergies: ["Penicillin"], emergencyContacts: [], dnrStatus: true }));
    const pubJwk = await crypto.subtle.exportKey("jwk", patientKeyPair.publicKey);
    const tagIdBytes = new TextEncoder().encode(JSON.stringify(pubJwk));

    const patientSig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, patientKeyPair.privateKey, triageDataBytes);
    const authoritySig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, authorityKeyPair.privateKey, tagIdBytes);

    const compressed = await new Response(new Blob([triageDataBytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();

    const ecdsaKeyGeneration = await time(async () => { await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); });
    const signatureCreation = await time(async () => { await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, patientKeyPair.privateKey, triageDataBytes); });
    const tier1Verification = await time(async () => { await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, patientKeyPair.publicKey, patientSig, triageDataBytes); });
    const tier2Verification = await time(async () => { await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, authorityKeyPair.publicKey, authoritySig, tagIdBytes); });
    const compression = await time(async () => { await new Response(new Blob([triageDataBytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer(); });
    const decompression = await time(async () => { await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer(); });
    const scanPathTotal = await time(async () => {
      await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
      await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, patientKeyPair.publicKey, patientSig, triageDataBytes);
      await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, authorityKeyPair.publicKey, authoritySig, tagIdBytes);
    });

    const result = {
      meta: {
        generatedAt: new Date().toISOString(), platform: "mobile-web-crypto",
        deviceModel: deviceInfo.model, androidVersion: deviceInfo.androidVersion, chromeVersion: deviceInfo.chromeVersion,
        warmupIterations: WARMUP, measuredIterations: MEASURED,
        encoding: "V1 (current production: short-format JSON, JWK public key, base64 signatures, gzip)",
      },
      operations: {
        ecdsaKeyGeneration, signatureCreation,
        tier1Verification_contentSignature: tier1Verification,
        tier2Verification_authoritySignature: tier2Verification,
        compression_gzip: compression, decompression_gunzip: decompression,
        scanPathTotal_decompressPlusTier1PlusTier2: scanPathTotal,
      },
    };
    setCryptoResult(result);
    setCryptoRunning(false);
    setStatus("Crypto latency benchmark complete.");
  };

  const downloadJson = (obj: any, filename: string) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = () => {
    const headers = ["trialType", "distance", "orientation", "material", "success", "retryCount", "handshakeMs", "tapToRenderMs", "timestamp"];
    const rows = trials.map((t) => headers.map((h) => (t as any)[h]).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "nfc-trials.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const postTrialsToBenchmarkEndpoint = async () => {
    setStatus(`Posting ${trials.length} trials to /api/v1/benchmarks/log...`);
    const base = (import.meta as any).env?.VITE_API_BASE_URL || "";
    let ok = 0, fail = 0;
    for (const t of trials) {
      try {
        await fetch(`${base}/api/v1/benchmarks/log`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: t.trialType.toUpperCase(),
            payloadSizeRaw: 0, payloadSizeCompressed: 0,
            timeElapsedMs: t.handshakeMs ?? -1,
            deviceMeta: `distance=${t.distance};orientation=${t.orientation};material=${t.material};success=${t.success};retries=${t.retryCount};tapToRenderMs=${t.tapToRenderMs ?? "n/a"};device=${deviceInfo.model};android=${deviceInfo.androidVersion};chrome=${deviceInfo.chromeVersion}`,
          }),
        });
        ok++;
      } catch { fail++; }
    }
    setStatus(`Posted ${ok} trials (${fail} failed).`);
  };

  const countsByCondition = () => {
    const counts: Record<string, number> = {};
    for (const t of trials) {
      const key = `${t.trialType}|${t.distance}|${t.orientation}|${t.material}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Bench: NFC Physical Trials (Phase 5)</h1>
      <p className="text-sm text-slate-600">Not patient-facing. See NFC_PROTOCOL.md for the full operator procedure.</p>

      {isNfcSupported === false && (
        <div className="p-3 bg-red-100 text-red-800 rounded">Web NFC is not available in this browser. Use Chrome for Android over a secure context (HTTPS or localhost).</div>
      )}

      <section className="border rounded p-4 space-y-2">
        <h2 className="font-semibold">Device info (auto-detected — edit if wrong/unknown)</h2>
        <label className="block text-sm">Model: <input className="border px-2 py-1 ml-2 w-64" value={deviceInfo.model} onChange={(e) => setDeviceInfo({ ...deviceInfo, model: e.target.value, manuallyEntered: true })} /></label>
        <label className="block text-sm">Android version: <input className="border px-2 py-1 ml-2 w-32" value={deviceInfo.androidVersion} onChange={(e) => setDeviceInfo({ ...deviceInfo, androidVersion: e.target.value, manuallyEntered: true })} /></label>
        <label className="block text-sm">Chrome version: <input className="border px-2 py-1 ml-2 w-32" value={deviceInfo.chromeVersion} onChange={(e) => setDeviceInfo({ ...deviceInfo, chromeVersion: e.target.value, manuallyEntered: true })} /></label>
        <label className="block text-sm">Tag unit cost (₹): <input className="border px-2 py-1 ml-2 w-32" value={tagCostInr} onChange={(e) => setTagCostInr(e.target.value)} placeholder="e.g. 25" /></label>
      </section>

      <section className="border rounded p-4 space-y-2">
        <h2 className="font-semibold">Trial condition (set before each tap)</h2>
        <div className="flex gap-4 flex-wrap">
          <label>Distance: <select className="border px-2 py-1 ml-1" value={distance} onChange={(e) => setDistance(e.target.value)}>{DISTANCES.map((d) => <option key={d}>{d}</option>)}</select></label>
          <label>Orientation: <select className="border px-2 py-1 ml-1" value={orientation} onChange={(e) => setOrientation(e.target.value)}>{ORIENTATIONS.map((o) => <option key={o}>{o}</option>)}</select></label>
          <label>Material: <select className="border px-2 py-1 ml-1" value={material} onChange={(e) => setMaterial(e.target.value)}>{MATERIALS.map((m) => <option key={m}>{m}</option>)}</select></label>
          <label>Retries so far: <input type="number" min={0} className="border px-2 py-1 ml-1 w-16" value={retryCount} onChange={(e) => setRetryCount(Number(e.target.value))} /></label>
        </div>
        <div className="flex gap-3 mt-2">
          <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={runReadTrial}>Run READ trial</button>
          <button className="bg-emerald-600 text-white px-4 py-2 rounded" onClick={runWriteTrial}>Run WRITE trial</button>
        </div>
        <p className="text-sm text-slate-700 min-h-[1.5em]">{status}</p>
      </section>

      <section className="border rounded p-4 space-y-2">
        <h2 className="font-semibold">Recorded trials: {trials.length}</h2>
        <div className="text-xs text-slate-600 max-h-40 overflow-auto">
          {Object.entries(countsByCondition()).map(([k, v]) => <div key={k}>{k}: {v}</div>)}
        </div>
        <div className="flex gap-3">
          <button className="border px-3 py-1 rounded" onClick={downloadCsv}>Export CSV</button>
          <button className="border px-3 py-1 rounded" onClick={postTrialsToBenchmarkEndpoint}>POST all to /api/v1/benchmarks/log</button>
          <button className="border px-3 py-1 rounded text-red-700" onClick={() => { persist([]); }}>Clear all trials</button>
        </div>
      </section>

      <section className="border rounded p-4 space-y-2">
        <h2 className="font-semibold">Mobile crypto/compression latency (Phase 3 mobile half)</h2>
        <button className="bg-purple-600 text-white px-4 py-2 rounded disabled:opacity-50" onClick={runMobileCryptoLatency} disabled={cryptoRunning}>
          {cryptoRunning ? "Running (100 iterations)..." : "Run crypto latency benchmark"}
        </button>
        {cryptoResult && (
          <>
            <pre className="text-xs bg-slate-100 p-2 overflow-auto max-h-64">{JSON.stringify(cryptoResult.operations, null, 2)}</pre>
            <button className="border px-3 py-1 rounded" onClick={() => downloadJson(cryptoResult, "crypto-latency-mobile.json")}>Download crypto-latency-mobile.json</button>
          </>
        )}
      </section>
    </div>
  );
};

export default BenchNfc;
