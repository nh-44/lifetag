import { useState, useEffect } from "react";
import { Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import NfcWriter from "./NfcWriter";

interface AdminPanelProps {
  onWriteComplete: (accountId: string) => void;
  onAuthChange?: (isAuthenticated: boolean) => void;
}

const AdminPanel = ({ onWriteComplete, onAuthChange }: AdminPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState("");

  const ADMIN_PASSWORD = "00000"; // Dummy password as requested

  const handleLogin = () => {
    const authenticated = password === ADMIN_PASSWORD;
    setIsAuthenticated(authenticated);
    
    if (authenticated) {
      setError("");
      if (onAuthChange) {
        onAuthChange(true);
      }
    } else {
      setError("Invalid password");
    }
  };

  const handleWriteComplete = (accountId: string) => {
    onWriteComplete(accountId);
    setIsOpen(false);
  };

  const handleWriteError = (error: string) => {
    console.error("Write error:", error);
  };

  const handleClose = () => {
    setIsOpen(false);
    if (isAuthenticated && onAuthChange) {
      // Keep authentication status when just closing the dialog
    }
    setPassword("");
    setError("");
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setIsOpen(false);
    setPassword("");
    setError("");
    if (onAuthChange) {
      onAuthChange(false);
    }
  };

  return (
    <>
      <Button 
        variant="outline" 
        className={`mt-4 ${isAuthenticated ? "bg-green-100 border-green-300 text-green-700" : "bg-gray-100"}`}
        onClick={() => setIsOpen(true)}
      >
        <Key className={`mr-2 h-4 w-4 ${isAuthenticated ? "text-green-600" : ""}`} />
        {isAuthenticated ? "Admin Panel" : "Admin"}
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open && isAuthenticated) {
          // User closed dialog but stays authenticated
          handleClose();
        } else if (!open) {
          // User closed dialog without authenticating
          handleLogout();
        } else {
          setIsOpen(open);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isAuthenticated ? "Admin Panel" : "Admin Login"}</DialogTitle>
          </DialogHeader>

          {!isAuthenticated ? (
            <div className="flex flex-col gap-4">
              <Input
                type="password"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <Button onClick={handleLogin}>Login</Button>
            </div>
          ) : (
            <div className="space-y-6">
              <NfcWriter
                onWriteComplete={handleWriteComplete}
                onWriteError={handleWriteError}
              />
              <div className="flex justify-end">
                <Button 
                  variant="outline" 
                  className="text-red-500 border-red-200 hover:bg-red-50"
                  onClick={handleLogout}
                >
                  Logout
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminPanel;
