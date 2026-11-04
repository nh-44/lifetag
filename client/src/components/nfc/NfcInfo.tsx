
import { useEffect, useState } from "react";
import { ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { NfcTagPayload } from "@/types";
import { NfcCryptoService } from "@/services/nfcCryptoService";
import TrustBadge, { TrustStatus } from "./TrustBadge";

// Offline a responder cannot learn that a tag was superseded or revoked; age is the
// one freshness signal the tag itself carries, so old tags get an explicit caution.
const STALE_AFTER_DAYS = 365;

interface NfcInfoProps {
  accountId: string | null;
  url: string | null;
  payload?: NfcTagPayload | null;
}

const NfcInfo = ({ accountId, url, payload }: NfcInfoProps) => {
  const navigate = useNavigate();
  const [trust, setTrust] = useState<TrustStatus>("loading");
  const [trustError, setTrustError] = useState<string | undefined>();

  // Verified entirely on-device (Web Crypto + the embedded authority key), so the
  // triage profile below renders with no network connection.
  useEffect(() => {
    if (!payload) return;
    if (payload.isUnsigned || !payload.signature) {
      setTrust("unsigned");
      return;
    }
    let cancelled = false;
    setTrust("loading");
    NfcCryptoService.verifyTagIntegrity(payload).then((r) => {
      if (cancelled) return;
      setTrustError(r.error);
      setTrust(!r.verified ? "failed" : r.trustedAuthority ? "authority-certified" : "self-signed");
    });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };
  
  if (!accountId || !url) return null;
  
  return (
    <Card className="w-full max-w-md p-6 border-gray-200">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Last Scanned Tag</h2>

      {payload && (
        <div className="mb-4">
          <TrustBadge status={trust} errorMessage={trustError} />
          {(trust === "authority-certified" || trust === "self-signed") && <OfflineTriage payload={payload} />}
        </div>
      )}
      
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">Account ID</p>
          <div className="flex items-center justify-between gap-2 p-3 bg-gray-50 rounded-md">
            <p className="text-gray-800 font-mono text-sm truncate">{accountId}</p>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => copyToClipboard(accountId, "Account ID")}
              title="Copy Account ID"
            >
              <Copy size={16} />
            </Button>
          </div>
        </div>
        
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">Profile URL</p>
          <div className="flex items-center justify-between gap-2 p-3 bg-gray-50 rounded-md">
            <p className="text-gray-800 font-mono text-sm truncate">{url}</p>
            <div className="flex gap-1">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => copyToClipboard(url, "URL")}
                title="Copy URL"
              >
                <Copy size={16} />
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate(`/emergency-info/${accountId}`, { state: { tagPayload: payload } })}
                title="Open URL"
              >
                <ExternalLink size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

/** The signed triage profile exactly as read from the tag. Only rendered after verification passes. */
const OfflineTriage = ({ payload }: { payload: NfcTagPayload }) => {
  const t = payload.triageData;
  const issuedAt = new Date(payload.timestamp);
  const ageDays = Math.floor((Date.now() - issuedAt.getTime()) / 86_400_000);

  return (
    <div className="space-y-2 rounded-md border border-gray-200 p-3 text-sm" data-testid="offline-triage">
      {t.dnrStatus && (
        <p className="rounded bg-red-600 px-2 py-1 text-center font-bold text-white">DO NOT RESUSCITATE</p>
      )}
      <p><span className="text-gray-500">Name:</span> <strong>{t.name}</strong></p>
      <p><span className="text-gray-500">Blood group:</span> <strong>{t.bloodGroup}</strong></p>
      <p>
        <span className="text-gray-500">Allergies:</span>{" "}
        <strong>{t.allergies.length ? t.allergies.join(", ") : "None recorded"}</strong>
      </p>
      {t.emergencyContacts.length > 0 && (
        <p>
          <span className="text-gray-500">Emergency contacts:</span>{" "}
          {t.emergencyContacts.map((c) => `${c.name} (${c.userId})`).join(", ")}
        </p>
      )}
      <p className={`text-xs ${ageDays > STALE_AFTER_DAYS ? "font-semibold text-amber-700" : "text-gray-500"}`}>
        Tag issued {issuedAt.toLocaleDateString()} ({ageDays} days ago).
        {ageDays > STALE_AFTER_DAYS && " Over a year old: confirm details with the patient or online when possible."}
      </p>
    </div>
  );
};

export default NfcInfo;
