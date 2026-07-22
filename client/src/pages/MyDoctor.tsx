
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, UserCheck, Building, Award } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfileByUserId, getDoctorProfile, UserProfile, DoctorProfile } from '@/services/userService';

const MyDoctor = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  
  useEffect(() => {
    // Redirect if not logged in or not a user
    if (!currentUser) {
      navigate('/login?redirectTo=/my-doctor');
      return;
    }
    
    if (currentUser.role !== 'USER') {
      navigate('/unauthorized');
      return;
    }
    
    const fetchProfiles = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch user profile
        const userData = await getUserProfileByUserId(currentUser.userId);
        
        if (!userData) {
          throw new Error('Failed to load your profile information');
        }
        
        setUserProfile(userData);
        
        // Check if user has a primary physician set
        if (userData.primaryPhysician && userData.primaryPhysician.userId) {
          try {
            // Fetch doctor profile
            const doctorData = await getDoctorProfile(userData.primaryPhysician.userId);
            setDoctorProfile(doctorData);
          } catch (doctorErr) {
            console.error('Error fetching doctor profile:', doctorErr);
            // We won't set an error here as the user's profile loaded successfully
          }
        }
      } catch (err) {
        console.error('Error fetching profiles:', err);
        const message = err instanceof Error ? err.message : 'Failed to load profile data';
        setError(message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProfiles();
  }, [currentUser, navigate]);
  
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lifetag-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading doctor information...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">My Primary Physician</h1>
        
        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        
        {userProfile && (
          <div className="space-y-6">
            {userProfile.primaryPhysician && userProfile.primaryPhysician.userId ? (
              <Card>
                <CardHeader className="bg-lifetag-light">
                  <CardTitle className="flex items-center">
                    <UserCheck className="h-5 w-5 mr-2 text-lifetag-primary" />
                    Primary Physician
                  </CardTitle>
                  <CardDescription>Your registered doctor</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Name</h3>
                        <p className="text-lg font-medium">{userProfile.primaryPhysician.name}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Doctor ID</h3>
                        <p className="text-lg font-medium">{userProfile.primaryPhysician.userId}</p>
                      </div>
                    </div>
                    
                    {doctorProfile && (
                      <>
                        <div className="pt-4">
                          <h3 className="text-sm font-medium text-gray-500">Contact Information</h3>
                          <p className="text-lg font-medium">{doctorProfile.contactInfo || 'Not specified'}</p>
                        </div>
                        
                        <div className="pt-2">
                          <div className="flex items-center mb-2">
                            <Building className="h-4 w-4 mr-2 text-lifetag-primary" />
                            <h3 className="text-sm font-medium text-gray-500">Hospital/Clinic</h3>
                          </div>
                          <p className="text-lg font-medium">{doctorProfile.hospitalClinic || 'Not specified'}</p>
                        </div>
                        
                        <div className="pt-2">
                          <div className="flex items-center mb-2">
                            <Award className="h-4 w-4 mr-2 text-lifetag-primary" />
                            <h3 className="text-sm font-medium text-gray-500">Specialty</h3>
                          </div>
                          <p className="text-lg font-medium">{doctorProfile.specialty || 'Not specified'}</p>
                        </div>
                        
                        {doctorProfile.qualifications && doctorProfile.qualifications.length > 0 && (
                          <div className="pt-2">
                            <h3 className="text-sm font-medium text-gray-500 mb-2">Qualifications</h3>
                            <ul className="list-disc list-inside">
                              {doctorProfile.qualifications.map((qual, idx) => (
                                <li key={idx} className="text-gray-800">{qual}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-6">
                  <p className="text-center text-gray-500">
                    You don't have a primary physician set up yet.
                  </p>
                </CardContent>
              </Card>
            )}
            
            <div className="flex justify-center space-x-4">
              <Button 
                variant="outline" 
                onClick={() => navigate('/')}
              >
                Return to Home
              </Button>
              <Button 
                className="bg-lifetag-primary hover:bg-lifetag-dark"
                onClick={() => navigate('/edit-profile')}
              >
                Update Doctor
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyDoctor;
