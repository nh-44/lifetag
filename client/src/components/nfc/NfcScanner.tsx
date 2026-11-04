import { useEffect, useRef, useState } from "react";
import { Scan } from "lucide-react";
import { NfcCryptoService } from "@/services/nfcCryptoService";
import { NfcTagPayload } from "@/types";
import { logBenchmarkTelemetry } from "@/services/api";
import { getNfcSupport, readTagOnce, describeNfcError } from "@/lib/webNfc";
import { decodeTagMessage, TagDecodeError } from "@/lib/tagCodec";

interface NfcScannerProps {
  isScanning: boolean;
  onScanComplete: (accountId: string, payload: NfcTagPayload) => void;
  onScanError: (error: string) => void;
}

/** One idle wait per readTagOnce call; the scanner simply re-arms until a tag arrives or scanning stops. */
const SCAN_WINDOW_MS = 60000;

/**
 * Waits for a tag while `isScanning` is true. Reads every AegisTag format (V3
 * binary, V1 gzip text, legacy JSON, ID-only), verifies signed tags on-device,
 * and reports exactly why a tag could not be used. There is no simulation mode:
 * on an unsupported browser the operator gets the real reason, never fake data.
 */
const NfcScanner = ({ isScanning, onScanComplete, onScanError }: NfcScannerProps) => {
  const [support] = useState(getNfcSupport);
  const [statusLine, setStatusLine] = useState("");
  // Refs keep the scan loop independent of the parent re-creating its callbacks
  // on every render; restarting the loop mid-tap would cancel the read.
  const onCompleteRef = useRef(onScanComplete);
  const onErrorRef = useRef(onScanError);
  onCompleteRef.current = onScanComplete;
  onErrorRef.current = onScanError;

  useEffect(() => {
    if (!isScanning) return;
    if (!support.supported) {
      onErrorRef.current(support.message);
      return;
    }

    const controller = new AbortController();

    const loop = async () => {
      while (!controller.signal.aborted) {
        let read;
        try {
          setStatusLine("Hold an NFC tag flat against the back of the phone…");
          read = await readTagOnce({ timeoutMs: SCAN_WINDOW_MS, signal: controller.signal });
        } catch (e) {
          if (controller.signal.aborted) return;
          const failure = describeNfcError(e);
          if (failure.code === "timeout") continue; // nothing tapped yet: keep waiting
          onErrorRef.current(failure.hint);
          return;
        }

        const t0 = performance.now();
        try {
          const { payload, format, contentBytes } = await decodeTagMessage(read.message);
          if (!/^\d{5}$/.test(payload.fhirPatientId || "")) throw new Error("Patient ID on the tag must be exactly 5 digits.");

          if (!payload.isUnsigned) {
            const { verified, error } = await NfcCryptoService.verifyTagIntegrity(payload);
            if (!verified) throw new Error(error || "Tag signature invalid (data may have been tampered with)");
          }

          void logBenchmarkTelemetry({
            operation: "READ",
            payloadSizeRaw: JSON.stringify(payload).length,
            payloadSizeCompressed: contentBytes,
            timeElapsedMs: read.elapsedMs + (performance.now() - t0),
            deviceMeta: `${navigator.userAgent} [${format}]`,
          });
          onCompleteRef.current(payload.fhirPatientId, payload);
        } catch (e) {
          const message = e instanceof TagDecodeError && e.reason === "empty"
            ? "This tag is blank. Issue it from the Tag Writer first."
            : e instanceof Error ? e.message : "Failed to read the tag.";
          onErrorRef.current(message);
        }
        return;
      }
    };

    void loop();
    return () => controller.abort();
  }, [isScanning, support]);

  return (
    <div className="flex flex-col items-center justify-center">
      <div className={`relative p-8 rounded-full bg-blue-100 ${isScanning ? 'animate-pulse' : ''}`}>
        <Scan
          size={64}
          className={`text-blue-600 ${isScanning ? 'animate-spin-slow' : ''}`}
        />

        {isScanning && (
          <div className="absolute inset-0 border-4 border-blue-400 rounded-full animate-ping opacity-50"></div>
        )}
      </div>

      <p className="mt-4 text-center text-gray-600">
        {isScanning ? statusLine || "Hold an NFC tag near your device..." : "Tap the button below to start scanning"}
      </p>

      {!support.supported && (
        <p className="mt-2 text-center text-orange-600 text-sm max-w-xs" data-testid="nfc-unsupported">
          {support.message}
        </p>
      )}
    </div>
  );
};

export default NfcScanner;
