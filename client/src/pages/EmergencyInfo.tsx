import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { getUserEmergencyInfo, EmergencyInfo as EmergencyInfoType } from '@/services/userService';
import { Badge } from '@/components/ui/badge';

const EmergencyInfo = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<EmergencyInfoType | null>(null);
  
  useEffect(() => {
    // Redirect if not logged in or not a first responder
    if (!currentUser) {
      navigate(`/login?redirectTo=/emergency-info/${accountId}`);
      return;
    }
    
    if (currentUser.role !== 'FIRST_RESPONDER') {
      // If user is owner of this account ID, go to edit profile
      if (currentUser.role === 'USER' && currentUser.accountId === accountId) {
        navigate('/edit-profile');
        return;
      }
      
      // If doctor, redirect to doctor view
      if (currentUser.role === 'DOCTOR') {
        navigate(`/medical-info/${accountId}`);
        return;
      }
      
      // Otherwise show unauthorized
      navigate('/unauthorized');
      return;
    }
    
    const fetchEmergencyInfo = async () => {
      if (!accountId) return;
      
      try {
        setLoading(true);
        setError(null);
        
        const data = await getUserEmergencyInfo(accountId);
        
        if (!data) {
          throw new Error('No information found for this Account ID');
        }
        
        setInfo(data);
      } catch (err) {
        console.error('Error fetching information:', err);
        const message = err instanceof Error ? err.message : 'Failed to load medical information';
        setError(message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchEmergencyInfo();
  }, [currentUser, accountId, navigate]);
  
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lifetag-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading emergency information...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Emergency Information</h1>
          <Badge className="bg-lifetag-primary">First Responder View</Badge>
        </div>
        
        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        
        {info && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="bg-lifetag-light">
                <CardTitle className="flex items-center">
                  <CheckCircle2 className="h-5 w-5 mr-2 text-green-600" />
                  Patient Information
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Name</h3>
                    <p className="text-lg font-medium">{info.name}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Account ID</h3>
                    <p className="text-lg font-medium">{info.accountId}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Age</h3>
                    <p className="text-lg font-medium">{info.age}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Blood Group</h3>
                    <p className="text-lg font-medium">{info.bloodGroup}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="bg-amber-50">
                  <CardTitle className="flex items-center">
                    <AlertTriangle className="h-5 w-5 mr-2 text-amber-600" />
                    Allergies
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {info.allergies.length > 0 ? (
                    <ul className="list-disc list-inside">
                      {info.allergies.map((allergy, index) => (
                        <li key={index} className="text-lg">{allergy}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-500">No known allergies</p>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className={info.dnrStatus ? "bg-red-50" : "bg-green-50"}>
                  <CardTitle className="flex items-center">
                    {info.dnrStatus ? (
                      <>
                        <AlertCircle className="h-5 w-5 mr-2 text-red-600" />
                        DNR Status: Active
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-5 w-5 mr-2 text-green-600" />
                        DNR Status: Not Active
                      </>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-lg">
                    {info.dnrStatus 
                      ? "This patient has a Do Not Resuscitate order." 
                      : "This patient does not have a Do Not Resuscitate order."}
                  </p>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader className="bg-lifetag-light">
                <CardTitle>Emergency Contacts</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                {info.emergencyContacts.length > 0 ? (
                  <div className="space-y-4">
                    {info.emergencyContacts.map((contact, index) => (
                      <div key={index} className="p-3 border rounded-md">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div>
                            <h3 className="text-sm font-medium text-gray-500">Name</h3>
                            <p className="text-lg font-medium">{contact.name}</p>
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-gray-500">User ID</h3>
                            <p className="text-lg font-medium">{contact.userId}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No emergency contacts listed</p>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="bg-lifetag-light">
                <CardTitle>Medical Information</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Primary Physician</h3>
                    <p className="text-lg font-medium">
                      {info.primaryPhysician.name || 'Not specified'} 
                      {info.primaryPhysician.userId ? ` (${info.primaryPhysician.userId})` : ''}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Insurance ID</h3>
                    <p className="text-lg font-medium">{info.insuranceId || 'Not specified'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <div className="text-center py-4">
              <p className="text-sm text-gray-500 mb-4">
                For complete medical information, please consult the patient's physician.
              </p>
              <Button 
                variant="outline" 
                onClick={() => navigate('/')}
                className="mx-auto"
              >
                Return to Home
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmergencyInfo;
