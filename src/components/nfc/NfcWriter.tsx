
import { useState, useEffect } from "react";
import { Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

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
      if (isNfcSupported) {
        // @ts-ignore - NDEFReader is not in TypeScript's lib.dom yet
        const ndef = new NDEFReader();
        
        toast.info("Hold an NFC tag near your device...");
        
        // Improved writing format - ensure we write as plain text
        // Create a proper text record with the account ID
        await ndef.write({
          records: [{ 
            recordType: "text", 
            data: accountId,
            lang: "en" // Explicitly set language code
          }]
        });
        
        console.log("Successfully wrote to NFC tag:", accountId);
        onWriteComplete(accountId);
        toast.success("Account ID written successfully!");
      } else {
        // Simulate writing for unsupported browsers
        setTimeout(() => {
          if (Math.random() > 0.2) {
            onWriteComplete(accountId);
            toast.success("Account ID written successfully!");
          } else {
            const errors = [
              "Tag not writable",
              "Tag moved too quickly",
              "Write failed",
              "Tag not compatible"
            ];
            const error = errors[Math.floor(Math.random() * errors.length)];
            onWriteError(error);
            toast.error(`Write failed: ${error}`);
          }
        }, 2000);
      }
    } catch (error: any) {
      console.error("NFC Write Error:", error);
      onWriteError(error.message || "Failed to write to NFC tag");
      toast.error(`Write failed: ${error.message || "Unknown error"}`);
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
