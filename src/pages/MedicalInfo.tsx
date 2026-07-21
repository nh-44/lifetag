import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, AlertTriangle, Pill, Activity, History } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { getUserFullProfile, UserProfile } from '@/services/userService';
import { Badge } from '@/components/ui/badge';

const MedicalInfo = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  useEffect(() => {
    // Redirect if not logged in or not a doctor
    if (!currentUser) {
      navigate(`/login?redirectTo=/medical-info/${accountId}`);
      return;
    }
    
    if (currentUser.role !== 'DOCTOR') {
      // If user is owner of this account ID, go to edit profile
      if (currentUser.role === 'USER' && currentUser.accountId === accountId) {
        navigate('/edit-profile');
        return;
      }
      
      // If first responder, redirect to emergency view
      if (currentUser.role === 'FIRST_RESPONDER') {
        navigate(`/emergency-info/${accountId}`);
        return;
      }
      
      // Otherwise show unauthorized
      navigate('/unauthorized');
      return;
    }
    
    const fetchMedicalInfo = async () => {
      if (!accountId) return;
      
      try {
        setLoading(true);
        setError(null);
        
        const data = await getUserFullProfile(accountId);
        
        if (!data) {
          throw new Error('No information found for this Account ID');
        }
        
        setProfile(data);
      } catch (err) {
        console.error('Error fetching information:', err);
        const message = err instanceof Error ? err.message : 'Failed to load medical information';
        setError(message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchMedicalInfo();
  }, [currentUser, accountId, navigate]);
  
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lifetag-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading medical information...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Complete Medical Information</h1>
          <Badge className="bg-lifetag-primary">Doctor View</Badge>
        </div>
        
        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        
        {profile && (
          <Tabs defaultValue="emergency" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="emergency">Emergency Information</TabsTrigger>
              <TabsTrigger value="medical">Medical Details</TabsTrigger>
            </TabsList>
            
            {/* Emergency Info Tab */}
            <TabsContent value="emergency" className="space-y-6">
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
                      <p className="text-lg font-medium">{profile.name}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">User ID</h3>
                      <p className="text-lg font-medium">{profile.userId}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Account ID</h3>
                      <p className="text-lg font-medium">{profile.accountId}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Age</h3>
                      <p className="text-lg font-medium">{profile.age}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Blood Group</h3>
                      <p className="text-lg font-medium">{profile.bloodGroup}</p>
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
                    {profile.allergies.length > 0 ? (
                      <ul className="list-disc list-inside">
                        {profile.allergies.map((allergy, index) => (
                          <li key={index} className="text-lg">{allergy}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-500">No known allergies</p>
                    )}
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className={profile.dnrStatus ? "bg-red-50" : "bg-green-50"}>
                    <CardTitle className="flex items-center">
                      {profile.dnrStatus ? (
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
                      {profile.dnrStatus 
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
                  {profile.emergencyContacts.length > 0 ? (
                    <div className="space-y-4">
                      {profile.emergencyContacts.map((contact, index) => (
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
                        {profile.primaryPhysician.name || 'Not specified'} 
                        {profile.primaryPhysician.userId ? ` (${profile.primaryPhysician.userId})` : ''}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Insurance ID</h3>
                      <p className="text-lg font-medium">{profile.insuranceId || 'Not specified'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Medical Details Tab */}
            <TabsContent value="medical" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="bg-lifetag-light">
                    <CardTitle className="flex items-center">
                      <Activity className="h-5 w-5 mr-2 text-lifetag-primary" />
                      Lifestyle
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Drinking Habits</h3>
                        <p className="text-lg font-medium">
                          {profile.doctorOnlyInfo.drinkingHabits || 'Not specified'}
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Smoking Habits</h3>
                        <p className="text-lg font-medium">
                          {profile.doctorOnlyInfo.smokingHabits || 'Not specified'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="bg-lifetag-light">
                    <CardTitle className="flex items-center">
                      <Activity className="h-5 w-5 mr-2 text-lifetag-primary" />
                      Last Physical Checkup
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Weight</h3>
                        <p className="text-lg font-medium">
                          {profile.doctorOnlyInfo.lastCheckup.weight || '-'} kg
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">BMI</h3>
                        <p className="text-lg font-medium">
                          {profile.doctorOnlyInfo.lastCheckup.bmi || '-'}
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Blood Sugar</h3>
                        <p className="text-lg font-medium">
                          {profile.doctorOnlyInfo.lastCheckup.sugar || '-'} mg/dL
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Blood Pressure</h3>
                        <p className="text-lg font-medium">
                          {profile.doctorOnlyInfo.lastCheckup.bp || '-'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader className="bg-lifetag-light">
                  <CardTitle className="flex items-center">
                    <Pill className="h-5 w-5 mr-2 text-lifetag-primary" />
                    Current Medications
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {profile.doctorOnlyInfo.medications.length > 0 ? (
                    <ul className="list-disc list-inside">
                      {profile.doctorOnlyInfo.medications.map((medication, index) => (
                        <li key={index} className="text-lg">{medication}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-500">No current medications</p>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="bg-lifetag-light">
                  <CardTitle className="flex items-center">
                    <AlertCircle className="h-5 w-5 mr-2 text-lifetag-primary" />
                    Current Illnesses or Disorders
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {profile.doctorOnlyInfo.illnesses.length > 0 ? (
                    <ul className="list-disc list-inside">
                      {profile.doctorOnlyInfo.illnesses.map((illness, index) => (
                        <li key={index} className="text-lg">{illness}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-500">No current illnesses or disorders</p>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="bg-lifetag-light">
                  <CardTitle className="flex items-center">
                    <History className="h-5 w-5 mr-2 text-lifetag-primary" />
                    Medical History
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <h3 className="text-md font-medium mb-2">Previous Surgeries</h3>
                  {profile.doctorOnlyInfo.surgeries.length > 0 ? (
                    <ul className="list-disc list-inside mb-6">
                      {profile.doctorOnlyInfo.surgeries.map((surgery, index) => (
                        <li key={index} className="text-lg">{surgery}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-500 mb-6">No previous surgeries</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
        
        <div className="flex justify-center mt-8">
          <Button 
            variant="outline" 
            onClick={() => navigate('/')}
            className="mx-2"
          >
            Return to Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MedicalInfo;
