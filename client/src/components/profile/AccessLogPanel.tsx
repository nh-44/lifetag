import { useEffect, useState } from "react";
import { getMyAccessLog, AccessLogEntry } from "@/services/userService";

const describe = (e: AccessLogEntry) => {
  if (e.accessType === "online-lookup") return "Looked up your triage record online";
  if (e.tagFreshness === "revoked") return "Scanned a REVOKED tag of yours";
  if (e.tagFreshness === "superseded") return "Scanned an old (superseded) tag of yours";
  return e.certified ? "Scanned your current tag" : "Scanned your tag (not certified)";
};

/**
 * "Who has accessed my record": every tag scan and online lookup, newest first.
 * This is how a patient notices that a lost or stolen tag is being used.
 */
const AccessLogPanel = () => {
  const [entries, setEntries] = useState<AccessLogEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getMyAccessLog().then(setEntries).catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-medium">Who has accessed my record</h3>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && entries === null && <p className="text-sm text-gray-500">Loading…</p>}
      {entries?.length === 0 && <p className="text-sm text-gray-500">No clinician has scanned your tag or looked up your record yet.</p>}
      {entries && entries.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm" data-testid="access-log">
          {entries.map((e, i) => (
            <li key={i} className={`p-3 ${e.tagFreshness === "revoked" ? "bg-red-50" : ""}`}>
              <p className="font-medium">{describe(e)}</p>
              <p className="text-gray-600">
                {e.scannerName}{e.organization ? `, ${e.organization}` : ""} ({e.scannedBy}) · {new Date(e.timestamp).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AccessLogPanel;
