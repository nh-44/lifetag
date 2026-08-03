import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

const OfflineBanner = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="bg-yellow-500 text-white text-sm px-4 py-2 flex items-center justify-center gap-2 z-50">
      <WifiOff size={16} />
      You are offline. Some features may not be available.
    </div>
  );
};

export default OfflineBanner;
