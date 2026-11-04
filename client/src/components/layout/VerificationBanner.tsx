import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithAuth } from "@/services/api";

/**
 * Tells a clinician whose account is not yet verified why clinical features return 403.
 * Status is re-read from the server, so the banner disappears as soon as the Healthcare
 * Authority verifies the account (no re-login needed).
 */
const VerificationBanner = () => {
  const { currentUser } = useAuth();
  const isClinician = currentUser?.role === "DOCTOR" || currentUser?.role === "FIRST_RESPONDER";
  const [verified, setVerified] = useState<boolean | undefined>(currentUser?.verified);

  useEffect(() => {
    setVerified(currentUser?.verified);
    if (!isClinician) return;
    let cancelled = false;
    const endpoint = currentUser!.role === "DOCTOR" ? "/doctors/me" : "/first-responders/me";
    fetchWithAuth(endpoint)
      .then((res) => {
        if (!cancelled && res?.success && typeof res.data?.verified === "boolean") setVerified(res.data.verified);
      })
      .catch(() => undefined); // offline: keep the last known status
    return () => {
      cancelled = true;
    };
  }, [currentUser, isClinician]);

  if (!isClinician || verified !== false) return null;
  return (
    <div role="status" className="flex items-center gap-2 bg-amber-100 border-b border-amber-300 px-4 py-2 text-sm text-amber-900">
      <ShieldAlert className="h-4 w-4 flex-shrink-0" />
      <span>
        Your clinician account is awaiting verification by the Healthcare Authority. Until then you cannot issue tags,
        log scans, or open patient records. Offline tag reading still works.
      </span>
    </div>
  );
};

export default VerificationBanner;
