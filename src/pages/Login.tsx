
import { useState, useEffect } from 'react';
import { useNavigate, Link, useParams, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';

const Login = () => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, loading, currentUser } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const redirectAccountId = params.accountId;
  
  // Get redirect URL from query parameters (for after login)
  const queryParams = new URLSearchParams(location.search);
  const redirectTo = queryParams.get('redirectTo');
  
  useEffect(() => {
    // If user is already logged in, redirect based on context
    if (currentUser) {
      if (redirectAccountId) {
        // Handle NFC tag URL access based on user role
        handleAccountAccess(redirectAccountId, currentUser.role);
      } else if (redirectTo) {
        navigate(redirectTo);
      } else {
        navigate('/');
      }
    }
  }, [currentUser, redirectAccountId, navigate, redirectTo]);

  const handleAccountAccess = (accountId: string, role: string) => {
    if (role === 'USER') {
      // If current user is the owner of this account ID, go to edit profile
      if (currentUser?.accountId === accountId) {
        navigate('/edit-profile');
      } else {
        // User is not the owner, show unauthorized page
        navigate(`/unauthorized`);
      }
    } else if (role === 'DOCTOR') {
      // Doctors see emergency + doctor info
      navigate(`/medical-info/${accountId}`);
    } else if (role === 'FIRST_RESPONDER') {
      // First responders see only emergency info
      navigate(`/emergency-info/${accountId}`);
    } else {
      // Redirect to unauthorized for unrecognized roles
      navigate(`/unauthorized`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      if (!userId || !password) {
        throw new Error('User ID and password are required');
      }
      
      await login(userId, password, redirectAccountId);
      
      // Note: Redirection happens in the useEffect hook after login success
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred during login';
      setError(message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Login to LifeTag</CardTitle>
          <CardDescription className="text-center">
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="userId" className="text-sm font-medium text-gray-700">
                User ID
              </label>
              <Input
                id="userId"
                placeholder="e.g., US12345, DR98765, FR54321"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Password
                </label>
                <Link to="/forgot-password" className="text-sm font-medium text-lifetag-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-lifetag-primary hover:bg-lifetag-dark"
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col">
          <div className="mt-2 text-center text-sm">
            <span className="text-gray-600">Not a user?</span>{' '}
            <Link to="/signup" className="font-medium text-lifetag-primary hover:underline">
              Sign up
            </Link>
          </div>
          <div className="mt-4 text-center text-xs text-gray-500">
            By logging in, you agree to our Terms of Service and Privacy Policy.
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Login;
