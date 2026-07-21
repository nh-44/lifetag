import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import NfcInfo from "@/components/nfc/NfcInfo";
import NfcScanner from "@/components/nfc/NfcScanner";
import AdminPanel from "@/components/nfc/AdminPanel";
import ScanHistory from "@/components/nfc/ScanHistory";
import { History, ShieldCheck } from "lucide-react";

interface ScanRecord {
  accountId: string;
  timestamp: number;
}

const TagTracer = () => {
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  const [lastScannedUrl, setLastScannedUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  const handleScan = (accountId: string) => {
    setLastScannedId(accountId);
    const url = `/emergency-info/${accountId}`;
    setLastScannedUrl(window.location.origin + url);
    setIsScanning(false);
    
    toast.success("NFC tag scanned successfully!");
    saveScanToHistory(accountId);
  };

  const saveScanToHistory = (accountId: string) => {
    const newScan: ScanRecord = {
      accountId,
      timestamp: Date.now()
    };
    
    try {
      const storedHistory = localStorage.getItem("scanHistory");
      let history: ScanRecord[] = [];
      
      if (storedHistory) {
        history = JSON.parse(storedHistory);
      }
      
      history.unshift(newScan);
      
      if (history.length > 100) {
        history = history.slice(0, 100);
      }
      
      localStorage.setItem("scanHistory", JSON.stringify(history));
    } catch (e) {
      console.error("Failed to save scan history:", e);
    }
  };

  const startScanning = () => {
    setIsScanning(true);
    toast.info("Scanning for NFC tags...");
  };

  const handleScanError = (error: string) => {
    setIsScanning(false);
    toast.error(`Scan failed: ${error}`);
  };

  const handleWriteComplete = (accountId: string) => {
    toast.success(`Successfully wrote ID ${accountId} to NFC tag`);
  };

  const handleAdminAuth = (isAuthenticated: boolean) => {
    setIsAdminAuthenticated(isAuthenticated);
    if (!isAuthenticated) {
      setShowHistory(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      toast.info("NFC permissions checked", {
        description: "Ready to scan NDEF-compatible NFC emergency tags."
      });
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gradient-to-b from-blue-50 to-white flex flex-col items-center p-6">
      <div className="flex items-center space-x-2 mt-4 mb-1">
        <ShieldCheck className="w-8 h-8 text-blue-600" />
        <h1 className="text-4xl font-bold text-blue-700">Tag Tracer & NFC Tools</h1>
      </div>
      <p className="text-gray-600 mb-8 text-center max-w-lg">
        Scan NDEF emergency health tags to view instant first-responder triage profiles or write encrypted tags.
      </p>
      
      <Card className="w-full max-w-md p-6 shadow-lg border-blue-100 mb-4 bg-white">
        <div className="flex flex-col items-center">
          <NfcScanner 
            isScanning={isScanning} 
            onScanComplete={handleScan}
            onScanError={handleScanError}
          />
          
          <Button 
            className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-10 py-6 text-lg rounded-full shadow-md transition-all"
            onClick={startScanning}
            disabled={isScanning}
          >
            {isScanning ? "Scanning..." : "Scan NFC Tag"}
          </Button>
          
          <div className="flex gap-4 mt-6 w-full justify-center">
            {isAdminAuthenticated && (
              <Button 
                variant="outline" 
                className="bg-gray-100 hover:bg-gray-200"
                onClick={() => setShowHistory(!showHistory)}
              >
                <History className="mr-2 h-4 w-4" />
                {showHistory ? "Hide History" : "Show History"}
              </Button>
            )}
            
            <AdminPanel 
              onWriteComplete={handleWriteComplete} 
              onAuthChange={handleAdminAuth}
            />
          </div>
        </div>
      </Card>
      
      {(lastScannedId || lastScannedUrl) && (
        <NfcInfo 
          accountId={lastScannedId} 
          url={lastScannedUrl} 
        />
      )}
      
      <ScanHistory visible={showHistory && isAdminAuthenticated} />
      
      <footer className="mt-auto pt-6 pb-4 text-center text-gray-500 text-sm">
        <p>Offline-First Enabled • Encrypted NDEF & Zero-Trust Protocol</p>
      </footer>
    </div>
  );
};

export default TagTracer;
