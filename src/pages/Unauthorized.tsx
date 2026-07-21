
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

const Unauthorized = () => {
  const navigate = useNavigate();
  
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="h-10 w-10 text-red-600" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Unauthorized Access</h1>
        <p className="text-gray-600 mb-8">
          You don't have permission to access this information. This may be because this account is not associated with your login, or your role does not grant you access to this data.
        </p>
        <div className="space-y-3">
          <Button 
            className="bg-lifetag-primary hover:bg-lifetag-dark w-full"
            onClick={() => navigate('/')}
          >
            Return to Home
          </Button>
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => navigate(-1)}
          >
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Unauthorized;
