
import { useState, useEffect } from "react";
import { History } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface ScanRecord {
  accountId: string;
  timestamp: number;
}

interface ScanHistoryProps {
  visible: boolean;
}

const ScanHistory = ({ visible }: ScanHistoryProps) => {
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);

  // Load scan history from localStorage
  useEffect(() => {
    const storedHistory = localStorage.getItem("scanHistory");
    if (storedHistory) {
      try {
        const parsed = JSON.parse(storedHistory) as ScanRecord[];
        setScanHistory(parsed);
      } catch (e) {
        console.error("Failed to parse scan history:", e);
      }
    }
  }, [visible]); // Reload when visibility changes

  const clearHistory = () => {
    localStorage.removeItem("scanHistory");
    setScanHistory([]);
  };

  if (!visible) return null;

  return (
    <div className="w-full max-w-md mx-auto mt-6 bg-white rounded-lg shadow-md p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center text-blue-700">
          <History className="mr-2 text-blue-600" />
          Scan History
        </h2>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={clearHistory}
          className="text-red-500 hover:text-red-700 border-red-200 hover:bg-red-50"
        >
          Clear History
        </Button>
      </div>

      {scanHistory.length === 0 ? (
        <p className="text-center text-gray-500 py-4">No scan history available</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-blue-50">
                <TableHead className="font-medium">Account ID</TableHead>
                <TableHead className="font-medium">Date</TableHead>
                <TableHead className="font-medium">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scanHistory.map((record, index) => {
                const date = new Date(record.timestamp);
                return (
                  <TableRow key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                    <TableCell className="font-medium text-blue-700">{record.accountId}</TableCell>
                    <TableCell>{date.toLocaleDateString()}</TableCell>
                    <TableCell>{date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default ScanHistory;
