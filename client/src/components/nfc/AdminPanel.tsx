import { useEffect, useState } from "react";
import { Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import NfcWriter from "./NfcWriter";

interface AdminPanelProps {
  onWriteComplete: (accountId: string) => void;
  onAuthChange?: (isAuthenticated: boolean) => void;
}

/**
 * Tag issuance panel. Access follows the logged-in account rather than a shared
 * password: only a DOCTOR session can open the writer, and the server enforces
 * the same rule on POST /issuance/certify, recording which doctor issued each tag.
 */
const AdminPanel = ({ onWriteComplete, onAuthChange }: AdminPanelProps) => {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const isIssuer = currentUser?.role === "DOCTOR";

  useEffect(() => {
    onAuthChange?.(isIssuer);
  }, [isIssuer, onAuthChange]);

  const handleWriteComplete = (accountId: string) => {
    onWriteComplete(accountId);
    setIsOpen(false);
  };

  const handleWriteError = (error: string) => {
    console.error("Write error:", error);
  };

  return (
    <>
      <Button
        variant="outline"
        className={`mt-4 ${isIssuer ? "bg-green-100 border-green-300 text-green-700" : "bg-gray-100"}`}
        onClick={() => setIsOpen(true)}
      >
        <Key className={`mr-2 h-4 w-4 ${isIssuer ? "text-green-600" : ""}`} />
        {isIssuer ? "Issue Tag" : "Issue Tag (clinicians)"}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isIssuer ? "Issue NFC Tag" : "Clinician Access Required"}</DialogTitle>
          </DialogHeader>

          {isIssuer ? (
            <NfcWriter
              onWriteComplete={handleWriteComplete}
              onWriteError={handleWriteError}
            />
          ) : (
            <p className="text-sm text-gray-600">
              Tags can only be issued from a doctor account, so every issuance is tied to an
              identified clinician. Log in with your DR account to continue.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminPanel;
