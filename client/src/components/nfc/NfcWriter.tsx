import { useState } from "react";
import { Edit, Download, Plus, Trash2, ShieldCheck, Nfc } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { NfcCryptoService } from "@/services/nfcCryptoService";
import { fetchWithAuth, logBenchmarkTelemetry } from "@/services/api";
import { certifyTagKey } from "@/services/userService";
import { getNfcSupport, writeTag, readTagOnce, describeNfcError, describeWriteError } from "@/lib/webNfc";
import { encodeTag, decodeTagMessage, sameContent, EncodedTag, TagFormat, TagModel, TAG_CAPACITY_BYTES } from "@/lib/tagCodec";

interface NfcWriterProps {
  onWriteComplete: (accountId: string) => void;
  onWriteError: (error: string) => void;
}

const FORMAT_LABELS: Record<TagFormat, string> = {
  "v3-binary": "V3 compact binary (recommended)",
  "v1-text": "V1 gzip text (legacy compatibility)",
  "id-only": "ID only, no clinical data (online lookup)",
};

/**
 * Tag issuance in two explicit steps:
 *  1. Prepare: sign with a fresh per-tag key and get the server certificate. This
 *     is the slow, network-bound part (a cold backend can take many seconds).
 *  2. Write: a separate button press, so the NFC write starts immediately inside
 *     a fresh user gesture and the operator only holds the tag for the write itself.
 * After writing, "Verify" reads the tag back and checks it byte-for-byte and
 * cryptographically, so a write is only reported good once it is proven good.
 */
const NfcWriter = ({ onWriteComplete, onWriteError }: NfcWriterProps) => {
  const [support] = useState(getNfcSupport);
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

  // Issuance options and state
  const [format, setFormat] = useState<TagFormat>("v3-binary");
  const [tagModel, setTagModel] = useState<TagModel>("NTAG216");
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [prepared, setPrepared] = useState<EncodedTag | null>(null);
  const [phase, setPhase] = useState<"idle" | "preparing" | "writing" | "verifying">("idle");
  const [lastWriteOk, setLastWriteOk] = useState(false);
  const [statusLine, setStatusLine] = useState("");

  const invalidate = () => {
    setPrepared(null);
    setLastWriteOk(false);
  };

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
      invalidate();
      toast.success("Profile fetched and loaded successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to load patient data");
    } finally {
      setIsFetching(false);
    }
  };

  const handleAddContact = () => {
    setEmergencyContacts([...emergencyContacts, { userId: "", name: "" }]);
    invalidate();
  };

  const handleRemoveContact = (index: number) => {
    const updated = emergencyContacts.filter((_, idx) => idx !== index);
    setEmergencyContacts(updated.length > 0 ? updated : [{ userId: "", name: "" }]);
    invalidate();
  };

  const handleContactChange = (index: number, key: "userId" | "name", value: string) => {
    const updated = [...emergencyContacts];
    updated[index] = { ...updated[index], [key]: value };
    setEmergencyContacts(updated);
    invalidate();
  };

  /** Step 1: sign + certify + encode. Network-bound; no NFC involved yet. */
  const handlePrepare = async () => {
    if (!/^\d{5}$/.test(fhirPatientId)) {
      toast.error("A 5-digit patient account ID is required");
      return;
    }
    if (format !== "id-only" && !name.trim()) {
      toast.error("Patient Name is required");
      return;
    }

    setPhase("preparing");
    setStatusLine("Signing and requesting the Healthcare Authority certificate…");
    try {
      const payload = await NfcCryptoService.generateTagPayload(
        {
          name: name.trim(),
          bloodGroup,
          allergies: allergiesText.split(",").map((s) => s.trim()).filter(Boolean),
          emergencyContacts: emergencyContacts.filter((c) => c.userId.trim() && c.name.trim()),
          dnrStatus,
          fhirPatientId,
        },
        // ID-only tags carry nothing to certify. Every other format is certified by the
        // server (DOCTOR only), which also makes it the patient's only current tag.
        format === "id-only" ? undefined : (publicKey, issuedAt) => certifyTagKey(fhirPatientId, publicKey, issuedAt)
      );
      const encoded = await encodeTag(payload, format);
      const capacity = TAG_CAPACITY_BYTES[tagModel];
      if (encoded.tagBytes > capacity) {
        throw new Error(
          `This tag needs ${encoded.tagBytes} B but an ${tagModel} holds ${capacity} B.` +
          (format === "v1-text" ? " Switch to V3 compact binary." : " Use a larger tag or shorten the profile.")
        );
      }
      setPrepared(encoded);
      setLastWriteOk(false);
      setStatusLine(`Ready: ${encoded.tagBytes} of ${capacity} B on ${tagModel}. Now press Write and hold the tag still.`);
    } catch (e: any) {
      setStatusLine("");
      toast.error(e.message || "Failed to prepare tag");
      onWriteError(e.message || "Failed to prepare tag");
    } finally {
      setPhase("idle");
    }
  };

  /** Step 2: the NFC write itself, started directly from the button press. */
  const handleWrite = async () => {
    if (!prepared) return;
    setPhase("writing");
    setStatusLine("Hold the tag flat against the back of the phone and keep it still…");
    try {
      const { attemptsUsed, elapsedMs } = await writeTag(prepared.records, { overwrite: allowOverwrite });
      void logBenchmarkTelemetry({
        operation: "WRITE",
        payloadSizeRaw: prepared.content.length,
        payloadSizeCompressed: prepared.tagBytes,
        timeElapsedMs: elapsedMs,
        deviceMeta: `${navigator.userAgent} [${prepared.format}; attempts=${attemptsUsed}]`,
      });
      setLastWriteOk(true);
      setStatusLine(`Written in ${(elapsedMs / 1000).toFixed(1)} s${attemptsUsed > 1 ? ` (${attemptsUsed} attempts)` : ""}. Tap Verify to read it back.`);
      toast.success("Tag written");
      onWriteComplete(fhirPatientId);
    } catch (e) {
      const failure = await describeWriteError(e, allowOverwrite);
      setStatusLine(failure.hint);
      toast.error(`Write failed: ${failure.hint}`);
      onWriteError(failure.raw);
    } finally {
      setPhase("idle");
    }
  };

  /** Read-after-write: the tag must hold exactly what was written, and it must verify. */
  const handleVerify = async () => {
    if (!prepared) return;
    setPhase("verifying");
    setStatusLine("Tap the tag again to verify it…");
    try {
      const read = await readTagOnce();
      if (!sameContent(prepared, read.message)) throw new Error("The tag does not contain the data that was just written. Write it again.");
      const { payload } = await decodeTagMessage(read.message);
      if (!payload.isUnsigned) {
        const result = await NfcCryptoService.verifyTagIntegrity(payload);
        if (!result.verified) throw new Error(result.error || "Read-back verification failed");
        setStatusLine(result.trustedAuthority ? "Verified: tag is byte-identical and authority-certified." : "Verified, but the certificate is not trusted by this device's authority key.");
      } else {
        setStatusLine("Verified: ID-only tag reads back correctly.");
      }
      toast.success("Tag verified");
    } catch (e) {
      const msg = e instanceof Error && !(e as any).failure ? e.message : describeNfcError(e).hint;
      setStatusLine(msg);
      toast.error(msg);
    } finally {
      setPhase("idle");
    }
  };

  const busy = phase !== "idle";

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2 pb-3 border-b">
        <Edit className="h-5 w-5 text-aegistag-primary" />
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
        <div className="space-y-4" onChange={invalidate}>
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
              <Select value={bloodGroup} onValueChange={(v) => { setBloodGroup(v); invalidate(); }}>
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
              onCheckedChange={(v) => { setDnrStatus(v); invalidate(); }}
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
        </div>

        <Separator />

        {/* Tag options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="tagFormat">Tag format</Label>
            <Select value={format} onValueChange={(v) => { setFormat(v as TagFormat); invalidate(); }}>
              <SelectTrigger id="tagFormat"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(FORMAT_LABELS) as TagFormat[]).map((f) => (
                  <SelectItem key={f} value={f}>{FORMAT_LABELS[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tagModel">Tag model</Label>
            <Select value={tagModel} onValueChange={(v) => { setTagModel(v as TagModel); invalidate(); }}>
              <SelectTrigger id="tagModel"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TAG_CAPACITY_BYTES) as TagModel[]).map((m) => (
                  <SelectItem key={m} value={m}>{m} ({TAG_CAPACITY_BYTES[m]} B)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 border rounded-lg bg-amber-50 border-amber-200">
          <div className="space-y-0.5">
            <Label htmlFor="allowOverwrite" className="font-medium">Allow overwriting a tag that already has data</Label>
            <p className="text-xs text-amber-800">Off: only blank tags are written, so an existing tag is never replaced by accident. Turn on to re-issue a tag.</p>
          </div>
          <Switch id="allowOverwrite" checked={allowOverwrite} onCheckedChange={setAllowOverwrite} />
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {!support.supported && (
            <p className="text-center text-orange-600 text-sm" data-testid="nfc-unsupported">{support.message}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button onClick={handlePrepare} disabled={busy || !/^\d{5}$/.test(fhirPatientId)} variant="outline" className="font-semibold">
              <ShieldCheck className="mr-2 h-4 w-4" />
              {phase === "preparing" ? "Preparing…" : "1. Prepare & certify"}
            </Button>
            <Button onClick={handleWrite} disabled={busy || !prepared || !support.supported} className="bg-green-600 hover:bg-green-700 font-semibold">
              <Nfc className="mr-2 h-4 w-4" />
              {phase === "writing" ? "Hold tag…" : "2. Write to tag"}
            </Button>
            <Button onClick={handleVerify} disabled={busy || !lastWriteOk || !support.supported} variant="outline">
              {phase === "verifying" ? "Tap tag…" : "3. Verify"}
            </Button>
          </div>
          <p className="text-sm text-slate-700 min-h-[1.25rem]" data-testid="writer-status">{statusLine}</p>

          {prepared && prepared.format === "v1-text" && (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer">Fallback for browsers without Web NFC: text for NFC Tools</summary>
              <p className="mt-1">NFC Tools → Write → Add a record → Text, then paste:</p>
              <div className="flex gap-2 mt-1">
                <code className="flex-1 truncate bg-white border rounded p-1">{new TextDecoder().decode(prepared.content)}</code>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(new TextDecoder().decode(prepared.content)); toast.success("Copied"); }}>Copy</Button>
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
};

export default NfcWriter;
