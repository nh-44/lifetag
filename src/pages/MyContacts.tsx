
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
import { AlertCircle, User } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfileByUserId, UserProfile } from '@/services/userService';

const MyContacts = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  useEffect(() => {
    // Redirect if not logged in or not a user
    if (!currentUser) {
      navigate('/login?redirectTo=/my-contacts');
      return;
    }
    
    if (currentUser.role !== 'USER') {
      navigate('/unauthorized');
      return;
    }
    
    const fetchUserProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const data = await getUserProfileByUserId(currentUser.userId);
        
        if (!data) {
          throw new Error('Failed to load your profile information');
        }
        
        setProfile(data);
      } catch (err) {
        console.error('Error fetching profile:', err);
        const message = err instanceof Error ? err.message : 'Failed to load profile data';
        setError(message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserProfile();
  }, [currentUser, navigate]);
  
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lifetag-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading contacts...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">My Emergency Contacts</h1>
        
        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        
        {profile && (
          <div className="space-y-6">
            {profile.emergencyContacts.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {profile.emergencyContacts.map((contact, index) => (
                  <Card key={index}>
                    <CardHeader className="bg-lifetag-light">
                      <CardTitle className="flex items-center">
                        <User className="h-5 w-5 mr-2 text-lifetag-primary" />
                        Contact {index + 1}
                      </CardTitle>
                      <CardDescription>Emergency Contact</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Name</h3>
                          <p className="text-lg font-medium">{contact.name}</p>
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">User ID</h3>
                          <p className="text-lg font-medium">{contact.userId}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-6">
                  <p className="text-center text-gray-500">
                    You don't have any emergency contacts set up yet.
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
                Edit Contacts
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyContacts;
