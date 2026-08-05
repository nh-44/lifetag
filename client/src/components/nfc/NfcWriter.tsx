import { useState, useEffect } from "react";
import { Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { NfcCryptoService } from "@/services/nfcCryptoService";
import { fetchWithAuth } from "@/services/api";

interface NfcWriterProps {
  onWriteComplete: (accountId: string) => void;
  onWriteError: (error: string) => void;
}

const NfcWriter = ({ onWriteComplete, onWriteError }: NfcWriterProps) => {
  const [accountId, setAccountId] = useState("");
  const [isWriting, setIsWriting] = useState(false);
  const [isNfcSupported, setIsNfcSupported] = useState<boolean | null>(null);

  // Check if NFC is supported
  useEffect(() => {
    // @ts-ignore - NDEFReader is not in TypeScript's lib.dom yet
    const isSupported = typeof NDEFReader !== 'undefined';
    setIsNfcSupported(isSupported);
  }, []);

  const validateAccountId = (id: string) => {
    // Must be 5 digits
    return /^\d{5}$/.test(id);
  };

  const handleWrite = async () => {
    if (!validateAccountId(accountId)) {
      toast.error("Account ID must be exactly 5 digits");
      return;
    }

    setIsWriting(true);

    try {
      // 1. Fetch real patient triage profile
      const response = await fetchWithAuth(`/patients/triage/${accountId}`);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || "Failed to fetch patient data");
      }
      
      const patientData = response.data;

      // 2. Generate the payload using the crypto service
      const payload = await NfcCryptoService.generateTagPayload({
        name: patientData.name,
        bloodGroup: patientData.bloodGroup,
        allergies: patientData.allergies,
        emergencyContacts: patientData.emergencyContacts,
        dnrStatus: patientData.dnrStatus,
        fhirPatientId: patientData.accountId,
        authoritySignature: patientData.authoritySignature,
      });

      // 3. Check the byte size limit
      const { rawBytes } = await NfcCryptoService.calculateByteSize(payload);
      
      if (rawBytes > 504) {
        const errorMsg = `Payload too large (${rawBytes} bytes). Max limit is 504 bytes.`;
        toast.error(errorMsg);
        onWriteError(errorMsg);
        setIsWriting(false);
        return;
      }

      const payloadString = JSON.stringify(payload);

      if (isNfcSupported) {
        // @ts-ignore - NDEFReader is not in TypeScript's lib.dom yet
        const ndef = new NDEFReader();
        
        toast.info(`Hold an NFC tag near your device... (${rawBytes} bytes)`);
        
        // 4. Write the JSON payload as a text record
        await ndef.write({
          records: [{ 
            recordType: "text", 
            data: payloadString,
            lang: "en" 
          }]
        });
        
        console.log("Successfully wrote to NFC tag:", payload);
        onWriteComplete(accountId);
        toast.success("Account ID written successfully!");
      } else {
        // Simulate writing for unsupported browsers
        toast.info(`Simulating NFC write... (${rawBytes} bytes)`);
        setTimeout(() => {
          onWriteComplete(accountId);
          toast.success("Simulation: Account ID written successfully!");
        }, 2000);
      }
    } catch (error: any) {
      console.error("NFC Write Error:", error);
      
      // Handle permission denied and other standard errors
      let errorMessage = error.message || "Failed to write to NFC tag";
      if (error.name === 'NotAllowedError') {
        errorMessage = "NFC permission denied. Please allow NFC access.";
      } else if (error.name === 'NotSupportedError') {
        errorMessage = "NFC is not supported on this device.";
      }
      
      onWriteError(errorMessage);
      toast.error(`Write failed: ${errorMessage}`);
    } finally {
      setIsWriting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-md mx-auto p-4">
      <h2 className="text-xl font-bold text-center">Admin: Write NFC Tag</h2>
      
      <div className="flex items-center gap-2">
        <Input
          type="text"
          placeholder="Enter 5-digit account ID"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value.replace(/\D/g, '').substring(0, 5))}
          maxLength={5}
          className="flex-1"
        />
        <Button 
          onClick={handleWrite}
          disabled={isWriting || !validateAccountId(accountId)}
          className="bg-green-600 hover:bg-green-700"
        >
          <Edit className="mr-2 h-4 w-4" />
          {isWriting ? "Writing..." : "Write"}
        </Button>
      </div>
      
      {isNfcSupported === false && (
        <p className="text-center text-orange-500 text-sm">
          NFC is not supported in this browser. Using simulation mode.
        </p>
      )}
    </div>
  );
};

export default NfcWriter;
