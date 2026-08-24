import { useEffect, useState, useRef } from "react";
import { Scan } from "lucide-react";
import { NfcCryptoService } from "@/services/nfcCryptoService";
import { NfcTagPayload } from "@/types";
import { logBenchmarkTelemetry } from "@/services/api";

interface NfcScannerProps {
  isScanning: boolean;
  onScanComplete: (accountId: string, payload: NfcTagPayload) => void;
  onScanError: (error: string) => void;
}

const NfcScanner = ({ isScanning, onScanComplete, onScanError }: NfcScannerProps) => {
  const [isNfcSupported, setIsNfcSupported] = useState<boolean | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  useEffect(() => {
    // @ts-ignore
    setIsNfcSupported(typeof NDEFReader !== 'undefined');
  }, []);

  useEffect(() => {
    if (!isScanning) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      return;
    }

    const startNfcScan = async () => {
      try {
        abortControllerRef.current = new AbortController();
        // @ts-ignore
        const ndef = new NDEFReader();
        
        await ndef.scan({ signal: abortControllerRef.current.signal });
        console.log("NFC scan started successfully");
        
        ndef.addEventListener("reading", async (event: any) => {
          console.log("NFC tag detected!");
          const startTimer = performance.now();
          
          if (!event.message || !event.message.records) {
            onScanError("Tag is empty or unreadable.");
            return;
          }

          let payload: NfcTagPayload | null = null;
          let parseErrorDetail = "";
          let rawSize = 0;
          let compressedSize = 0;

          for (const record of event.message.records) {
            if (record.recordType === "mime" && record.mediaType === "application/octet-stream") {
              try {
                // Convert DataView to Uint8Array safely
                const rawData = record.data;
                const compressedBytes = new Uint8Array(rawData.buffer, rawData.byteOffset, rawData.byteLength);
                compressedSize = compressedBytes.length;
                payload = await NfcCryptoService.decompressPayload(compressedBytes);
                rawSize = JSON.stringify(payload).length;
                console.log("Decompressed binary tag payload successfully:", payload);
                break;
              } catch (e: any) {
                console.error("Failed to decompress binary record:", e);
                parseErrorDetail = e.message || "Decompression failed";
              }
            } else if (record.recordType === "text") {
              try {
                // Robust NDEF text record parser (strips status byte and lang prefix if present)
                const rawData = record.data;
                let recordBytes: Uint8Array;
                if (rawData instanceof ArrayBuffer) {
                  recordBytes = new Uint8Array(rawData);
                } else if (rawData && rawData.buffer instanceof ArrayBuffer) {
                  recordBytes = new Uint8Array(rawData.buffer, rawData.byteOffset, rawData.byteLength);
                } else if (rawData instanceof Uint8Array) {
                  recordBytes = rawData;
                } else {
                  recordBytes = new Uint8Array(rawData || []);
                }
                
                let textContent = "";
                const directDecoder = new TextDecoder(record.encoding || "utf-8");
                const directDecoded = directDecoder.decode(recordBytes);
                
                if (directDecoded.startsWith("gzip:") || directDecoded.startsWith("{") || directDecoded.includes('{"')) {
                  textContent = directDecoded;
                } else if (recordBytes.length > 0) {
                  const statusByte = recordBytes[0];
                  const isUtf16 = (statusByte & 0x80) !== 0;
                  const langCodeLen = statusByte & 0x3F;
                  if (1 + langCodeLen < recordBytes.length) {
                    const textBytes = recordBytes.slice(1 + langCodeLen);
                    const manualDecoder = new TextDecoder(isUtf16 ? "utf-16" : "utf-8");
                    textContent = manualDecoder.decode(textBytes);
                  } else {
                    textContent = directDecoded;
                  }
                }

                if (textContent.startsWith("gzip:")) {
                  // Decompress base64 Gzip string
                  const base64Str = textContent.substring(5);
                  const binaryStr = atob(base64Str);
                  const len = binaryStr.length;
                  const bytes = new Uint8Array(len);
                  for (let i = 0; i < len; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                  }
                  payload = await NfcCryptoService.decompressPayload(bytes);
                  compressedSize = bytes.length;
                  rawSize = JSON.stringify(payload).length;
                  console.log("Decompressed base64 Gzip tag payload successfully:", payload);
                  break;
                } else {
                  const jsonStartIndex = textContent.indexOf('{');
                  if (jsonStartIndex !== -1) {
                    const cleanJson = textContent.substring(jsonStartIndex);
                    payload = JSON.parse(cleanJson);
                    rawSize = cleanJson.length;
                    compressedSize = rawSize; // No compression on legacy text
                    console.log("Parsed legacy text JSON payload successfully:", payload);
                    break;
                  } else if (/^\d{5}$/.test(textContent.trim())) {
                    const cleanId = textContent.trim();
                    payload = {
                      version: "2.0",
                      timestamp: new Date().toISOString(),
                      fhirPatientId: cleanId,
                      isUnsigned: true,
                      triageData: {
                        name: "Patient " + cleanId,
                        bloodGroup: "O-Negative",
                        allergies: [],
                        emergencyContacts: [],
                        dnrStatus: false
                      }
                    };
                    rawSize = cleanId.length;
                    compressedSize = rawSize;
                    console.log("Parsed ultra-compact 5-digit ID payload successfully:", payload);
                    break;
                  } else {
                    parseErrorDetail = "Invalid payload format. No JSON found or 5-digit ID found.";
                  }
                }
              } catch (e: any) {
                console.error("Error decoding text record:", e);
                parseErrorDetail = e.message || "JSON parse failed";
              }
            }
          }

          if (!payload) {
            onScanError(`No readable record found on the NFC tag. ${parseErrorDetail}`);
            return;
          }

          try {
            // Validate
            if (!payload.fhirPatientId) {
              throw new Error("Missing patient ID in tag payload.");
            }

            if (!/^\d{5}$/.test(payload.fhirPatientId)) {
              throw new Error("Patient ID must be exactly 5 digits.");
            }

            // Verify Crypto Integrity (Two-Tier Verification)
            let isVerified = false;
            let isTrusted = false;
            
            if (payload.isUnsigned) {
              console.warn("Unsigned tag detected. Bypassing cryptographic validation (Developer/NTAG213 Mode).");
            } else {
              const { verified, trustedAuthority, error: verifyError } = await NfcCryptoService.verifyTagIntegrity(payload);
              if (!verified) {
                throw new Error(verifyError || "Patient signature invalid (tampered triage data)");
              }
              isVerified = verified;
              isTrusted = trustedAuthority;
            }

            const endTimer = performance.now();
            const duration = endTimer - startTimer;

            // Log read telemetry speed
            await logBenchmarkTelemetry({
              operation: "READ",
              payloadSizeRaw: rawSize,
              payloadSizeCompressed: compressedSize,
              timeElapsedMs: duration,
              deviceMeta: navigator.userAgent,
            });

            // Success
            console.log(`Successfully parsed, verified, and logged tag payload in ${duration.toFixed(2)}ms:`, payload);
            onScanComplete(payload.fhirPatientId, payload);
            
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
              abortControllerRef.current = null;
            }
          } catch (error: any) {
            console.error("Payload Parse Error:", error);
            onScanError(error.message || "Failed to parse NFC data.");
          }
        });
        
        ndef.addEventListener("error", (error: any) => {
          console.error("NFC Error:", error);
          onScanError(error.message || "Failed to read NFC tag");
        });
        
      } catch (error: any) {
        console.error("Error starting NFC scan:", error);
        if (error.name === "NotAllowedError") {
          onScanError("NFC permission denied. Please allow NFC access.");
        } else if (error.name === "NotSupportedError") {
          simulateNfcScan(); // Fallback
        } else {
          onScanError(error.message || "Failed to start NFC scanner");
        }
      }
    };
    
    const simulateNfcScan = () => {
      console.log("Using simulated NFC scan");
      let active = true;
      
      const runSimulation = async () => {
        try {
          const mockPayload = await NfcCryptoService.generateTagPayload({
            name: "Jane Doe",
            bloodGroup: "O-",
            allergies: ["None"],
            emergencyContacts: [],
            dnrStatus: false,
            fhirPatientId: "12345",
          });
          
          if (!active) return;
          
          const { verified, trustedAuthority } = await NfcCryptoService.verifyTagIntegrity(mockPayload);
          
          if (verified) {
            console.log("Simulated scanned payload:", mockPayload);
            onScanComplete(mockPayload.fhirPatientId, mockPayload);
          }
        } catch (e) {
          console.error("Simulation error", e);
        }
      };

      const scanTimer = setTimeout(runSimulation, 2000);
      
      return () => {
        active = false;
        clearTimeout(scanTimer);
      };
    };
    
    if (isNfcSupported) {
      startNfcScan();
    } else {
      const cleanup = simulateNfcScan();
      return cleanup;
    }
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [isScanning, isNfcSupported, onScanComplete, onScanError]);
  
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
        {isScanning 
          ? "Hold an NFC tag near your device..." 
          : "Tap the button below to start scanning"
        }
      </p>
      
      {isNfcSupported === false && (
        <p className="mt-2 text-center text-orange-500 text-sm">
          NFC is not supported in this browser. Using simulation mode.
        </p>
      )}
    </div>
  );
};

export default NfcScanner;
