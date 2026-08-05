import { useEffect, useState, useRef } from "react";
import { Scan } from "lucide-react";
import { NfcCryptoService } from "@/services/nfcCryptoService";
import { NfcTagPayload } from "@/types";

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
          
          if (!event.message || !event.message.records) {
            onScanError("Tag is empty or unreadable.");
            return;
          }

          let textContent = "";
          for (const record of event.message.records) {
            if (record.recordType === "text") {
              const textDecoder = new TextDecoder(record.encoding || "utf-8");
              try {
                // Some browsers might pass raw bytes including the language code prefix.
                // We'll decode it and cleanly find the JSON substring later.
                textContent = textDecoder.decode(record.data);
              } catch (e) {
                console.error("Error decoding text record", e);
              }
              break;
            }
          }

          if (!textContent) {
            onScanError("No text record found on the NFC tag.");
            return;
          }

          try {
            // Find JSON bracket to skip any native NDEF language prefixes
            const jsonStartIndex = textContent.indexOf('{');
            if (jsonStartIndex === -1) {
              throw new Error("Invalid payload format. No JSON found.");
            }
            
            const cleanJson = textContent.substring(jsonStartIndex);
            const payload = JSON.parse(cleanJson);

            // Validate
            if (!payload.fhirPatientId) {
              throw new Error("Missing patient ID in tag payload.");
            }

            if (!/^\d{5}$/.test(payload.fhirPatientId)) {
              throw new Error("Patient ID must be exactly 5 digits.");
            }

            // Verify Crypto Integrity
            const { verified, trustedAuthority, error: verifyError } = await NfcCryptoService.verifyTagIntegrity(payload);
            if (!verified) {
              throw new Error(verifyError || "Patient signature invalid (tampered triage data)");
            }

            // Success
            console.log("Successfully parsed and verified payload:", payload);
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
