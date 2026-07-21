
import { ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

interface NfcInfoProps {
  accountId: string | null;
  url: string | null;
}

const NfcInfo = ({ accountId, url }: NfcInfoProps) => {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };
  
  if (!accountId || !url) return null;
  
  return (
    <Card className="w-full max-w-md p-6 border-gray-200">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Last Scanned Tag</h2>
      
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
                onClick={() => window.open(url, "_blank")}
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

export default NfcInfo;
