import { useState, useEffect } from "react";
import { Edit, Download, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { NfcCryptoService } from "@/services/nfcCryptoService";
import { fetchWithAuth, logBenchmarkTelemetry } from "@/services/api";

interface NfcWriterProps {
  onWriteComplete: (accountId: string) => void;
  onWriteError: (error: string) => void;
}

const NfcWriter = ({ onWriteComplete, onWriteError }: NfcWriterProps) => {
  const [isNfcSupported, setIsNfcSupported] = useState<boolean | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchAccountId, setFetchAccountId] = useState("");

  // Form Fields
  const [fhirPatientId, setFhirPatientId] = useState("");
  const [name, setName] = useState("");
  const [bloodGroup, setBloodGroup] = useState("O-Negative");
  const [allergiesText, setAllergiesText] = useState("");
  const [dnrStatus, setDnrStatus] = useState(false);
  const [emergencyContacts, setEmergencyContacts] = useState<Array<{ userId: string; name: string }>>([
    { userId: "", name: "" }
  ]);
  const [authoritySignature, setAuthoritySignature] = useState("");
  const [generatedPayloadText, setGeneratedPayloadText] = useState("");
  const [generatedPayloadHex, setGeneratedPayloadHex] = useState("");

  // Check if NFC is supported
  useEffect(() => {
    // @ts-ignore
    setIsNfcSupported(typeof NDEFReader !== 'undefined');
  }, []);

  const handleFetchProfile = async () => {
    if (!/^\d{5}$/.test(fetchAccountId)) {
      toast.error("Account ID must be exactly 5 digits");
      return;
    }

    setIsFetching(true);
    try {
      const response = await fetchWithAuth(`/patients/triage/${fetchAccountId}`);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || "Failed to fetch patient data");
      }

      const patientData = response.data;
      setFhirPatientId(patientData.accountId || fetchAccountId);
      setName(patientData.name || "");
      setBloodGroup(patientData.bloodGroup || "O-Negative");
      setAllergiesText(patientData.allergies?.join(", ") || "");
      setDnrStatus(patientData.dnrStatus || false);
      setEmergencyContacts(
        patientData.emergencyContacts?.length > 0
          ? patientData.emergencyContacts
          : [{ userId: "", name: "" }]
      );
      setAuthoritySignature(patientData.authoritySignature || "");
      toast.success("Profile fetched and loaded successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to load patient data");
    } finally {
      setIsFetching(false);
    }
  };

  const handleAddContact = () => {
    setEmergencyContacts([...emergencyContacts, { userId: "", name: "" }]);
  };

  const handleRemoveContact = (index: number) => {
    const updated = emergencyContacts.filter((_, idx) => idx !== index);
    setEmergencyContacts(updated.length > 0 ? updated : [{ userId: "", name: "" }]);
  };

  const handleContactChange = (index: number, key: "userId" | "name", value: string) => {
    const updated = [...emergencyContacts];
    updated[index][key] = value;
    setEmergencyContacts(updated);
  };

  const handleCopyPayload = () => {
    if (!generatedPayloadText) {
      toast.error("Please generate/write the payload first to copy it.");
      return;
    }
    navigator.clipboard.writeText(generatedPayloadText);
    toast.success("NFC Payload copied to clipboard!");
  };

  const handleCopyHex = () => {
    if (!generatedPayloadHex) {
      toast.error("Please generate/write the payload first to copy it.");
      return;
    }
    navigator.clipboard.writeText(generatedPayloadHex);
    toast.success("Hex bytes copied to clipboard!");
  };

  const handleWrite = async () => {
    if (!fhirPatientId.trim()) {
      toast.error("FHIR Patient ID is required");
      return;
    }
    if (!name.trim()) {
      toast.error("Patient Name is required");
      return;
    }

    // Filter valid emergency contacts
    const validContacts = emergencyContacts.filter(c => c.userId.trim() && c.name.trim());

    setIsWriting(true);
    try {
      // 1. Generate local ECDSA signed payload from form fields
      const payload = await NfcCryptoService.generateTagPayload({
        name,
        bloodGroup,
        allergies: allergiesText.split(",").map(s => s.trim()).filter(Boolean),
        emergencyContacts: validContacts,
        dnrStatus,
        fhirPatientId,
        authoritySignature: authoritySignature || undefined,
      });

      // 2. Compress the payload using native Gzip Compression Stream
      const compressedBytes = await NfcCryptoService.compressPayload(payload);
      
      console.log(`Payload prepared. Raw JSON size: ${JSON.stringify(payload).length} bytes. Compressed size: ${compressedBytes.length} bytes.`);

      if (compressedBytes.length > 504) {
        throw new Error(`Compressed payload size (${compressedBytes.length} bytes) exceeds standard NTAG215 budget (504 bytes). Please reduce input fields.`);
      }

      // Convert Uint8Array to Base64 string for robust text-based write
      const binaryToBase64 = (bytes: Uint8Array) => {
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      };
      
      const compressedBase64 = binaryToBase64(compressedBytes);
      const textRecordValue = `gzip:${compressedBase64}`;
      
      const bytesToHex = (bytes: Uint8Array) => {
        return Array.from(bytes)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      };
      const compressedHex = bytesToHex(compressedBytes);

      setGeneratedPayloadText(textRecordValue);
      setGeneratedPayloadHex(compressedHex);

      if (isNfcSupported) {
        // @ts-ignore
        const ndef = new NDEFReader();
        toast.info(`Hold the NFC tag near your device... (${compressedBytes.length} bytes)`);

        const startTimer = performance.now();

        // 3. Write Base64 Gzip payload as a standard text record (universally compatible)
        await ndef.write({
          records: [
            {
              recordType: "text",
              data: textRecordValue,
              lang: "en"
            }
          ]
        });

        const endTimer = performance.now();
        const duration = endTimer - startTimer;

        // Log write speed telemetry
        await logBenchmarkTelemetry({
          operation: "WRITE",
          payloadSizeRaw: JSON.stringify(payload).length,
          payloadSizeCompressed: compressedBytes.length,
          timeElapsedMs: duration,
          deviceMeta: navigator.userAgent,
        });

        console.log(`Successfully wrote compressed payload to tag in ${duration.toFixed(2)}ms:`, payload);
        toast.success(`Compressed NFC Tag written successfully in ${duration.toFixed(0)}ms!`);
        onWriteComplete(fhirPatientId);
      } else {
        // Simulate writing for unsupported browsers
        toast.info(`Simulating NFC write of compressed payload... (${compressedBytes.length} bytes)`);
        const startTimer = performance.now();
        await new Promise(resolve => setTimeout(resolve, 1000));
        const duration = performance.now() - startTimer;

        await logBenchmarkTelemetry({
          operation: "WRITE",
          payloadSizeRaw: JSON.stringify(payload).length,
          payloadSizeCompressed: compressedBytes.length,
          timeElapsedMs: duration,
          deviceMeta: `${navigator.userAgent} [SIMULATED]`,
        });

        toast.success("Simulation: NFC Tag written successfully!");
        onWriteComplete(fhirPatientId);
      }
    } catch (error: any) {
      console.error("NFC Write Error:", error);
      let errorMessage = error.message || "Failed to write to NFC tag";
      if (error.name === 'NotAllowedError') {
        errorMessage = "NFC permission denied. Please allow NFC access.";
      } else if (error.name === 'NotSupportedError') {
        errorMessage = "NFC is not supported on this device or tag configuration.";
      } else if (error.name === 'NetworkError') {
        errorMessage = "NFC connection lost/IO Error. Please hold the tag steady against the back of the device for 2-3 seconds.";
      }
      onWriteError(errorMessage);
      toast.error(`Write failed: ${errorMessage}`);
    } finally {
      setIsWriting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2 pb-3 border-b">
        <Edit className="h-5 w-5 text-lifetag-primary" />
        <h2 className="text-xl font-bold">Emergency Triage Card Writer</h2>
      </div>
      
      <div className="space-y-6">
        {/* Fetch Section */}
        <div className="bg-slate-100 p-4 rounded-lg flex flex-col md:flex-row gap-3 items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="fetchAccountId">Auto-Fill from Account ID</Label>
            <Input
              id="fetchAccountId"
              type="text"
              placeholder="Enter 5-digit account ID"
              value={fetchAccountId}
              onChange={(e) => setFetchAccountId(e.target.value.replace(/\D/g, '').substring(0, 5))}
              maxLength={5}
            />
          </div>
          <Button 
            variant="outline"
            onClick={handleFetchProfile}
            disabled={isFetching || !/^\d{5}$/.test(fetchAccountId)}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {isFetching ? "Fetching..." : "Fetch Profile"}
          </Button>
        </div>

        <Separator />

        {/* Triage Form Fields */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Patient Triage Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fhirPatientId">FHIR Patient ID (5-digit Account ID)</Label>
              <Input
                id="fhirPatientId"
                placeholder="e.g. 12345"
                value={fhirPatientId}
                onChange={(e) => setFhirPatientId(e.target.value.replace(/\D/g, '').substring(0, 5))}
                maxLength={5}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="patientName">Full Name</Label>
              <Input
                id="patientName"
                placeholder="Enter patient full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bloodGroup">Blood Group</Label>
              <Select value={bloodGroup} onValueChange={setBloodGroup}>
                <SelectTrigger id="bloodGroup">
                  <SelectValue placeholder="Select blood group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A-Positive">A+</SelectItem>
                  <SelectItem value="A-Negative">A-</SelectItem>
                  <SelectItem value="B-Positive">B+</SelectItem>
                  <SelectItem value="B-Negative">B-</SelectItem>
                  <SelectItem value="AB-Positive">AB+</SelectItem>
                  <SelectItem value="AB-Negative">AB-</SelectItem>
                  <SelectItem value="O-Positive">O+</SelectItem>
                  <SelectItem value="O-Negative">O-</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="allergies">Allergies (comma-separated)</Label>
              <Input
                id="allergies"
                placeholder="e.g. Penicillin, Peanuts, Latex"
                value={allergiesText}
                onChange={(e) => setAllergiesText(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg bg-slate-50">
            <div className="space-y-0.5">
              <Label htmlFor="dnrStatus" className="font-medium">Do Not Resuscitate (DNR) Status</Label>
              <p className="text-sm text-slate-500">Enable if patient has a verified DNR directive</p>
            </div>
            <Switch
              id="dnrStatus"
              checked={dnrStatus}
              onCheckedChange={setDnrStatus}
            />
          </div>

          {/* Emergency Contacts */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="font-semibold text-base">Emergency Contacts</Label>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={handleAddContact}
                className="flex items-center gap-1 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Contact
              </Button>
            </div>

            {emergencyContacts.map((contact, index) => (
              <div key={index} className="flex gap-3 items-end p-3 border rounded-lg bg-slate-50/50">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Contact Name</Label>
                    <Input
                      placeholder="Jane Doe"
                      value={contact.name}
                      onChange={(e) => handleContactChange(index, "name", e.target.value)}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Contact User ID</Label>
                    <Input
                      placeholder="US54321"
                      value={contact.userId}
                      onChange={(e) => handleContactChange(index, "userId", e.target.value)}
                      className="bg-white"
                    />
                  </div>
                </div>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => handleRemoveContact(index)}
                  disabled={emergencyContacts.length === 1 && !contact.userId && !contact.name}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Authority Certificate */}
          <div className="space-y-2">
            <Label htmlFor="authSig">Healthcare Authority Digital Certificate</Label>
            <Input
              id="authSig"
              value={authoritySignature}
              disabled
              placeholder="Fetched automatically from portal database"
              className="bg-slate-100 italic text-xs text-slate-500 truncate"
            />
          </div>
        </div>

        <Separator />

        {/* Action Button */}
        <div className="space-y-2">
          <Button 
            onClick={handleWrite}
            disabled={isWriting || !name.trim() || !fhirPatientId.trim()}
            className="w-full bg-green-600 hover:bg-green-700 font-semibold"
          >
            {isWriting ? "Writing to Tag..." : "Write Compressed Payload to NFC"}
          </Button>
          
          {isNfcSupported === false && (
            <p className="text-center text-orange-500 text-xs">
              NFC is not supported in this browser. Running in Simulation mode.
            </p>
          )}

          {generatedPayloadText && (
            <div className="mt-4 p-4 border rounded-lg bg-blue-50/50 border-blue-100 space-y-4">
              <div className="border-b pb-2">
                <span className="text-sm font-bold text-blue-900 flex items-center gap-1.5">
                  📋 NFC Tools Write Options (Manual Workaround)
                </span>
                <p className="text-[10px] text-slate-500 mt-1">
                  Use these values in third-party apps like <strong>NFC Tools</strong> if your mobile browser throws write conflicts.
                </p>
              </div>

              {/* Option 1: Standard Text Record */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-700">Option A: Text Record (Easiest)</span>
                  <Button 
                    onClick={handleCopyPayload}
                    variant="outline" 
                    size="sm"
                    className="bg-white text-blue-600 border-blue-200 hover:bg-blue-50 text-[10px] h-7 px-2.5"
                  >
                    Copy Text Payload
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  In NFC Tools, select <strong>Write → Add a record → Text</strong>. Paste this string:
                </p>
                <div className="bg-white p-2 border rounded font-mono text-xs text-slate-500 truncate max-w-full">
                  {generatedPayloadText}
                </div>
              </div>

              {/* Option 2: Custom MIME Record */}
              <div className="space-y-1.5 pt-1 border-t">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-700">Option B: Custom MIME Record</span>
                  <Button 
                    onClick={handleCopyHex}
                    variant="outline" 
                    size="sm"
                    className="bg-white text-blue-600 border-blue-200 hover:bg-blue-50 text-[10px] h-7 px-2.5"
                  >
                    Copy Hex Bytes
                  </Button>
                </div>
                <div className="text-[11px] text-slate-600 space-y-1">
                  <p>In NFC Tools, select <strong>Write → Add a record → Data / Custom Record</strong>:</p>
                  <ul className="list-disc list-inside pl-1 text-[10px] text-slate-500 space-y-0.5">
                    <li><strong>Content-Type:</strong> <code className="bg-slate-100 px-1 rounded">application/octet-stream</code></li>
                    <li><strong>Data Type:</strong> Choose <strong>Hexadecimal</strong> (not Text/ASCII)</li>
                    <li><strong>Data:</strong> Paste the copied Hex payload below:</li>
                  </ul>
                </div>
                <div className="bg-white p-2 border rounded font-mono text-xs text-slate-500 truncate max-w-full">
                  {generatedPayloadHex}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NfcWriter;
