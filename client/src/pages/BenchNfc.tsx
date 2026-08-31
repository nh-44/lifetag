import { useEffect, useState } from "react";
import { NfcCryptoService } from "@/services/nfcCryptoService";
import { logBenchmarkTelemetry } from "@/services/api";

/**
 * Bench: NFC Physical Trials — a simple QA page (not patient-facing) for
 * collecting the one kind of data that can't be measured from a desktop:
 * real NFC read/write handshake timing and real mobile Web Crypto timing.
 * See NFC_PROTOCOL.md for how to use it.
 */

interface NfcTrial {
  trialType: "read" | "write";
  note: string;
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
  let model = "";
  try {
    // @ts-ignore - Chrome-only User-Agent Client Hints API
    if (navigator.userAgentData?.getHighEntropyValues) {
      // @ts-ignore
      const hints = await navigator.userAgentData.getHighEntropyValues(["model"]);
      if (hints.model) model = hints.model;
    }
  } catch { /* fall through to manual entry */ }

  return { model, androidVersion: androidMatch?.[1] ?? "", chromeVersion: chromeMatch?.[1] ?? "" };
}

const BenchNfc = () => {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({ model: "", androidVersion: "", chromeVersion: "" });
  const [note, setNote] = useState("1cm, flat, bare tag");
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

  const recordTrial = (trial: NfcTrial) => {
    persist([...trials, trial]);
    setRetryCount(trial.success ? 0 : retryCount + 1); // auto-tracks retries: resets on success
  };

  const runReadTrial = async () => {
    setStatus("Hold the written tag near the phone now...");
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
            // the closest a web page can get to "rendered on screen" without a native profiler.
            setStatus(`Rendered: ${payload?.triageData?.name ?? "(no payload found on tag)"}`);
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            const tapToRenderMs = performance.now() - tapStart;

            clearTimeout(timeout);
            controller.abort();
            recordTrial({ trialType: "read", note, success: true, retryCount, handshakeMs, tapToRenderMs, timestamp: new Date().toISOString() });
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
      recordTrial({ trialType: "read", note, success: false, retryCount, handshakeMs: null, tapToRenderMs: null, timestamp: new Date().toISOString() });
      setStatus(`Read trial FAILED: ${e.message}`);
    }
  };

  const runWriteTrial = async () => {
    setStatus("Hold the blank tag near the phone now...");
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

      recordTrial({ trialType: "write", note, success: true, retryCount, handshakeMs, tapToRenderMs: null, timestamp: new Date().toISOString() });
      setStatus(`Write trial recorded (${handshakeMs.toFixed(1)} ms).`);
    } catch (e: any) {
      recordTrial({ trialType: "write", note, success: false, retryCount, handshakeMs: null, tapToRenderMs: null, timestamp: new Date().toISOString() });
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
    const headers = ["trialType", "note", "success", "retryCount", "handshakeMs", "tapToRenderMs", "timestamp"];
    const rows = trials.map((t) => headers.map((h) => JSON.stringify((t as any)[h] ?? "")).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "nfc-trials.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const postTrialsToBenchmarkEndpoint = async () => {
    setStatus(`Posting ${trials.length} trials to the backend...`);
    let ok = 0;
    for (const t of trials) {
      const res = await logBenchmarkTelemetry({
        operation: t.trialType.toUpperCase() as "READ" | "WRITE",
        payloadSizeRaw: 0,
        payloadSizeCompressed: 0,
        timeElapsedMs: t.handshakeMs ?? -1,
        deviceMeta: `note=${t.note};success=${t.success};retries=${t.retryCount};tapToRenderMs=${t.tapToRenderMs ?? "n/a"};device=${deviceInfo.model};android=${deviceInfo.androidVersion};chrome=${deviceInfo.chromeVersion}`,
      });
      if ((res as any)?.success !== false) ok++;
    }
    setStatus(`Posted ${ok}/${trials.length} trials to the backend.`);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Bench: NFC Physical Trials</h1>
      <p className="text-sm text-slate-600">Not patient-facing — a simple QA page. See NFC_PROTOCOL.md for the full procedure.</p>

      {isNfcSupported === false && (
        <div className="p-3 bg-red-100 text-red-800 rounded">Web NFC is not available. Use Chrome for Android, and make sure this page loaded over HTTPS.</div>
      )}

      <section className="border rounded p-4 space-y-2">
        <h2 className="font-semibold">Device info (auto-detected — edit if blank/wrong)</h2>
        <label className="block text-sm">Model: <input className="border px-2 py-1 ml-2 w-64" value={deviceInfo.model} onChange={(e) => setDeviceInfo({ ...deviceInfo, model: e.target.value })} placeholder="e.g. Pixel 7" /></label>
        <label className="block text-sm">Android version: <input className="border px-2 py-1 ml-2 w-32" value={deviceInfo.androidVersion} onChange={(e) => setDeviceInfo({ ...deviceInfo, androidVersion: e.target.value })} /></label>
        <label className="block text-sm">Chrome version: <input className="border px-2 py-1 ml-2 w-32" value={deviceInfo.chromeVersion} onChange={(e) => setDeviceInfo({ ...deviceInfo, chromeVersion: e.target.value })} /></label>
        <label className="block text-sm">Tag unit cost (₹): <input className="border px-2 py-1 ml-2 w-32" value={tagCostInr} onChange={(e) => setTagCostInr(e.target.value)} placeholder="e.g. 25" /></label>
      </section>

      <section className="border rounded p-4 space-y-2">
        <h2 className="font-semibold">Run a trial</h2>
        <label className="block text-sm">Note (optional — e.g. distance/orientation if you want to vary it): <input className="border px-2 py-1 ml-2 w-64" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="flex gap-3 mt-2">
          <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={runReadTrial}>Run READ trial</button>
          <button className="bg-emerald-600 text-white px-4 py-2 rounded" onClick={runWriteTrial}>Run WRITE trial</button>
        </div>
        <p className="text-sm text-slate-700 min-h-[1.5em]">{status}</p>
      </section>

      <section className="border rounded p-4 space-y-2">
        <h2 className="font-semibold">Recorded trials: {trials.length} ({trials.filter((t) => t.trialType === "read").length} read, {trials.filter((t) => t.trialType === "write").length} write, {trials.filter((t) => !t.success).length} failed)</h2>
        <div className="flex gap-3">
          <button className="border px-3 py-1 rounded" onClick={downloadCsv}>Export CSV</button>
          <button className="border px-3 py-1 rounded" onClick={postTrialsToBenchmarkEndpoint}>POST all to backend</button>
          <button className="border px-3 py-1 rounded text-red-700" onClick={() => persist([])}>Clear all trials</button>
        </div>
      </section>

      <section className="border rounded p-4 space-y-2">
        <h2 className="font-semibold">Mobile crypto/compression latency</h2>
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
