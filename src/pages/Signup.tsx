
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';

type AccountType = 'USER' | 'DOCTOR' | 'FIRST_RESPONDER';

const prefixMap: Record<AccountType, string> = {
  'USER': 'US',
  'DOCTOR': 'DR',
  'FIRST_RESPONDER': 'FR'
};

const Signup = () => {
  const [accountType, setAccountType] = useState<AccountType>('USER');
  const [idNumber, setIdNumber] = useState('');
  const [fullUserId, setFullUserId] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isIdAvailable, setIsIdAvailable] = useState<boolean | null>(null);
  const [checkingId, setCheckingId] = useState(false);
  
  const { signup, loading, currentUser, checkUserIdAvailability } = useAuth();
  const navigate = useNavigate();
  
  // Update full user ID when account type or ID number changes
  useEffect(() => {
    const prefix = prefixMap[accountType];
    if (idNumber && idNumber.length <= 5) {
      const paddedId = idNumber.padStart(5, '0');
      setFullUserId(`${prefix}${paddedId}`);
    } else if (idNumber.length > 5) {
      setIdNumber(idNumber.slice(0, 5));
    }
  }, [accountType, idNumber]);
  
  useEffect(() => {
    // Redirect if already logged in
    if (currentUser) {
      navigate('/edit-profile');
    }
  }, [currentUser, navigate]);
  
  // Check user ID availability with debounce
  useEffect(() => {
    if (!fullUserId || fullUserId.length < 7) {
      setIsIdAvailable(null);
      return;
    }
    
    const checkAvailability = async () => {
      try {
        setCheckingId(true);
        const isAvailable = await checkUserIdAvailability(fullUserId);
        setIsIdAvailable(isAvailable);
      } catch (error) {
        console.error('Error checking ID availability:', error);
      } finally {
        setCheckingId(false);
      }
    };
    
    const timeout = setTimeout(checkAvailability, 500);
    return () => clearTimeout(timeout);
  }, [fullUserId, checkUserIdAvailability]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      if (!fullUserId || !password || !confirmPassword || !name) {
        throw new Error('All fields are required');
      }
      
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }
      
      if (isIdAvailable === false) {
        throw new Error('This User ID is already taken. Please choose another.');
      }
      
      if (fullUserId.length !== 7) {
        throw new Error('User ID must be 7 characters (2 letter prefix + 5 digits)');
      }
      
      await signup({
        userId: fullUserId,
        name,
        password,
        confirmPassword,
        role: accountType
      });
      
      // If successful, the user will be logged in and redirected in the useEffect hook
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred during signup';
      setError(message);
    }
  };
  
  const renderUserIdStatus = () => {
    if (!fullUserId || fullUserId.length < 7) {
      return null;
    }
    
    if (checkingId) {
      return (
        <div className="flex items-center text-yellow-600">
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          <span className="text-xs">Checking availability...</span>
        </div>
      );
    }
    
    if (isIdAvailable === true) {
      return (
        <div className="flex items-center text-green-600">
          <Check className="mr-1 h-4 w-4" />
          <span className="text-xs">User ID is available</span>
        </div>
      );
    }
    
    if (isIdAvailable === false) {
      return (
        <div className="flex items-center text-red-600">
          <AlertCircle className="mr-1 h-4 w-4" />
          <span className="text-xs">User ID is already taken</span>
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Create a LifeTag Account</CardTitle>
          <CardDescription className="text-center">
            Get started with your medical information system
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
              <label htmlFor="accountType" className="text-sm font-medium text-gray-700">
                Account Type
              </label>
              <Select
                defaultValue={accountType}
                onValueChange={(value) => setAccountType(value as AccountType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">Regular User</SelectItem>
                  <SelectItem value="DOCTOR">Doctor</SelectItem>
                  <SelectItem value="FIRST_RESPONDER">First Responder</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <div>
                <label htmlFor="userId" className="text-sm font-medium text-gray-700">
                  User ID
                </label>
                <div className="text-xs text-gray-500 mb-1">
                  Your ID will be: {prefixMap[accountType]}-XXXXX (5 digits)
                </div>
              </div>
              <div className="flex">
                <div className="bg-gray-100 flex items-center justify-center px-3 rounded-l-md border border-r-0 border-gray-300 text-gray-500">
                  {prefixMap[accountType]}
                </div>
                <Input
                  id="idNumber"
                  className="rounded-l-none"
                  placeholder="Enter 5 digits"
                  value={idNumber}
                  onChange={(e) => {
                    const onlyDigits = e.target.value.replace(/[^0-9]/g, '');
                    setIdNumber(onlyDigits);
                  }}
                  maxLength={5}
                  required
                />
              </div>
              {renderUserIdStatus()}
            </div>
            
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-gray-700">
                Full Name
              </label>
              <Input
                id="name"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
                Confirm Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-lifetag-primary hover:bg-lifetag-dark"
              disabled={loading || isIdAvailable === false}
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col">
          <div className="mt-2 text-center text-sm">
            <span className="text-gray-600">Already have an account?</span>{' '}
            <Link to="/login" className="font-medium text-lifetag-primary hover:underline">
              Login
            </Link>
          </div>
          <div className="mt-4 text-center text-xs text-gray-500">
            By signing up, you agree to our Terms of Service and Privacy Policy.
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Signup;
