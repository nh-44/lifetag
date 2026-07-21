import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Plus, X, Save } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { UserProfile, DoctorProfile, FirstResponderProfile, getUserProfileByRole, saveUserProfile, saveDoctorProfile, saveFirstResponderProfile } from '@/services/userService';
import { toast } from 'sonner';

const EditProfile = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  // State for loading and error handling
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  
  // State for different profile types
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [firstResponderProfile, setFirstResponderProfile] = useState<FirstResponderProfile | null>(null);
  
  // State for doctor verification in user profiles
  const [doctorPassword, setDoctorPassword] = useState('');
  const [userPasswordConfirm, setUserPasswordConfirm] = useState('');
  
  // Additional state for dynamic fields (medications, illnesses, surgeries, etc.)
  const [medications, setMedications] = useState<string[]>(['']);
  const [illnesses, setIllnesses] = useState<string[]>(['']);
  const [surgeries, setSurgeries] = useState<string[]>(['']);
  const [qualifications, setQualifications] = useState<string[]>(['']);
  
  // Load profile based on user role
  useEffect(() => {
    const fetchProfileData = async () => {
      if (!currentUser) {
        navigate('/login');
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        
        const profile = await getUserProfileByRole(currentUser.userId, currentUser.role);
        
        if (!profile) {
          // Create empty profile based on user role
          if (currentUser.role === 'USER') {
            setUserProfile({
              userId: currentUser.userId,
              accountId: currentUser.accountId || currentUser.userId.substring(2),
              name: currentUser.name,
              age: 0,
              bloodGroup: '',
              allergies: [],
              emergencyContacts: [],
              dnrStatus: false,
              primaryPhysician: { userId: '', name: '' },
              insuranceId: '',
              doctorOnlyInfo: {
                drinkingHabits: '',
                smokingHabits: '',
                medications: [],
                illnesses: [],
                surgeries: [],
                lastCheckup: {
                  weight: 0,
                  bmi: 0,
                  sugar: 0,
                  bp: ''
                }
              }
            });
          } else if (currentUser.role === 'DOCTOR') {
            setDoctorProfile({
              userId: currentUser.userId,
              name: currentUser.name,
              contactInfo: '',
              medicalLicenseNumber: `ML-${Math.floor(Math.random() * 900000) + 100000}`,
              qualifications: [''],
              hospitalClinic: '',
              specialty: ''
            });
            setQualifications(['']);
          } else if (currentUser.role === 'FIRST_RESPONDER') {
            setFirstResponderProfile({
              userId: currentUser.userId,
              name: currentUser.name,
              occupation: 'First Responder',
              contactInfo: '',
              agency: '',
              agencyId: '',
              organizationType: 'Government',
              qualification: ''
            });
          }
        } else {
          // Set profile data based on user role
          if (currentUser.role === 'USER') {
            const userProfileData = profile as UserProfile;
            setUserProfile(userProfileData);
            
            // Set dynamic fields
            setMedications(userProfileData.doctorOnlyInfo.medications.length ? 
              userProfileData.doctorOnlyInfo.medications : ['']);
            setIllnesses(userProfileData.doctorOnlyInfo.illnesses.length ? 
              userProfileData.doctorOnlyInfo.illnesses : ['']);
            setSurgeries(userProfileData.doctorOnlyInfo.surgeries.length ? 
              userProfileData.doctorOnlyInfo.surgeries : ['']);
          } else if (currentUser.role === 'DOCTOR') {
            const doctorProfileData = profile as DoctorProfile;
            setDoctorProfile(doctorProfileData);
            setQualifications(doctorProfileData.qualifications.length ? 
              doctorProfileData.qualifications : ['']);
          } else if (currentUser.role === 'FIRST_RESPONDER') {
            setFirstResponderProfile(profile as FirstResponderProfile);
          }
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        setError('Failed to load profile data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchProfileData();
  }, [currentUser, navigate]);
  
  // Handle adding/removing dynamic field items
  const handleAddField = (
    fieldArray: string[], 
    setFieldArray: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setFieldArray([...fieldArray, '']);
  };
  
  const handleRemoveField = (
    index: number, 
    fieldArray: string[], 
    setFieldArray: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (fieldArray.length <= 1) return;
    const newArray = [...fieldArray];
    newArray.splice(index, 1);
    setFieldArray(newArray);
  };
  
  const handleFieldChange = (
    index: number, 
    value: string, 
    fieldArray: string[], 
    setFieldArray: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const newArray = [...fieldArray];
    newArray[index] = value;
    setFieldArray(newArray);
  };
  
  // Save profile handlers
  const handleSaveUserEmergencyInfo = async () => {
    if (!userProfile) return;
    
    try {
      setSaving(true);
      setError(null);
      
      // Update user profile with emergency info
      const updatedProfile: UserProfile = {
        ...userProfile,
        // Keep doctor-only info as is
      };
      
      // In a real app, this would validate and save to the backend
      await saveUserProfile(updatedProfile);
      toast.success('Emergency information saved successfully');
    } catch (err) {
      console.error('Error saving emergency info:', err);
      setError('Failed to save emergency information. Please try again.');
      toast.error('Failed to save emergency information');
    } finally {
      setSaving(false);
    }
  };
  
  const handleSaveDoctorOnlyInfo = async () => {
    if (!userProfile) return;
    
    try {
      setSaving(true);
      setError(null);
      
      // Validate doctor password and user password
      if (!doctorPassword || !userPasswordConfirm) {
        throw new Error('Both your password and doctor password are required');
      }
      
      // In a real app, this would verify both passwords
      // Here we'll just simulate success
      
      // Update user profile with doctor-only info
      const updatedProfile: UserProfile = {
        ...userProfile,
        doctorOnlyInfo: {
          ...userProfile.doctorOnlyInfo,
          medications: medications.filter(m => m.trim() !== ''),
          illnesses: illnesses.filter(i => i.trim() !== ''),
          surgeries: surgeries.filter(s => s.trim() !== '')
        }
      };
      
      await saveUserProfile(updatedProfile);
      toast.success('Medical information saved successfully');
      
      // Clear password fields
      setDoctorPassword('');
      setUserPasswordConfirm('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save medical information';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };
  
  const handleSaveDoctorProfile = async () => {
    if (!doctorProfile) return;
    
    try {
      setSaving(true);
      setError(null);
      
      // Update doctor profile
      const updatedProfile: DoctorProfile = {
        ...doctorProfile,
        qualifications: qualifications.filter(q => q.trim() !== '')
      };
      
      await saveDoctorProfile(updatedProfile);
      toast.success('Doctor profile saved successfully');
      navigate('/');
    } catch (err) {
      console.error('Error saving doctor profile:', err);
      setError('Failed to save doctor profile. Please try again.');
      toast.error('Failed to save doctor profile');
    } finally {
      setSaving(false);
    }
  };
  
  const handleSaveFirstResponderProfile = async () => {
    if (!firstResponderProfile) return;
    
    try {
      setSaving(true);
      setError(null);
      
      await saveFirstResponderProfile(firstResponderProfile);
      toast.success('First responder profile saved successfully');
      navigate('/');
    } catch (err) {
      console.error('Error saving first responder profile:', err);
      setError('Failed to save profile. Please try again.');
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };
  
  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lifetag-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }
  
  if (!currentUser) {
    navigate('/login');
    return null;
  }
  
  // Render appropriate form based on user role
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8 text-center">Edit Your Profile</h1>
      
      {error && (
        <Alert variant="destructive" className="mb-6 max-w-3xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {/* User Profile Form */}
      {currentUser.role === 'USER' && userProfile && (
        <Tabs defaultValue="emergency-info" className="max-w-3xl mx-auto">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="emergency-info">Emergency Information</TabsTrigger>
            <TabsTrigger value="doctor-info">Medical Information</TabsTrigger>
          </TabsList>
          
          {/* Emergency Information Tab */}
          <TabsContent value="emergency-info">
            <Card>
              <CardHeader>
                <CardTitle>Emergency Information</CardTitle>
                <CardDescription>
                  This information is visible to emergency responders and doctors
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="userId">User ID</Label>
                    <Input id="userId" value={userProfile.userId} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountId">Account ID</Label>
                    <Input id="accountId" value={userProfile.accountId} disabled />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input 
                      id="name" 
                      value={userProfile.name} 
                      onChange={(e) => setUserProfile({...userProfile, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="age">Age</Label>
                    <Input 
                      id="age" 
                      type="number" 
                      value={userProfile.age || ''} 
                      onChange={(e) => setUserProfile({...userProfile, age: parseInt(e.target.value) || 0})}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bloodGroup">Blood Group</Label>
                    <Select 
                      value={userProfile.bloodGroup} 
                      onValueChange={(value) => setUserProfile({...userProfile, bloodGroup: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select blood group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A+">A+</SelectItem>
                        <SelectItem value="A-">A-</SelectItem>
                        <SelectItem value="B+">B+</SelectItem>
                        <SelectItem value="B-">B-</SelectItem>
                        <SelectItem value="AB+">AB+</SelectItem>
                        <SelectItem value="AB-">AB-</SelectItem>
                        <SelectItem value="O+">O+</SelectItem>
                        <SelectItem value="O-">O-</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="allergies">Allergies</Label>
                    <Input 
                      id="allergies" 
                      placeholder="Separate with commas" 
                      value={userProfile.allergies.join(', ')} 
                      onChange={(e) => setUserProfile({
                        ...userProfile, 
                        allergies: e.target.value.split(',').map(a => a.trim()).filter(a => a !== '')
                      })}
                    />
                  </div>
                </div>
                
                <div>
                  <Label className="mb-2 block">Emergency Contacts</Label>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contact1">Contact 1 User ID</Label>
                        <Input 
                          id="contact1" 
                          placeholder="e.g., US12345" 
                          value={userProfile.emergencyContacts[0]?.userId || ''}
                          onChange={(e) => {
                            const contacts = [...userProfile.emergencyContacts];
                            if (contacts[0]) {
                              contacts[0] = {...contacts[0], userId: e.target.value};
                            } else {
                              contacts[0] = {userId: e.target.value, name: ''};
                            }
                            setUserProfile({...userProfile, emergencyContacts: contacts});
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact1Name">Contact 1 Name</Label>
                        <Input 
                          id="contact1Name" 
                          placeholder="First contact name" 
                          value={userProfile.emergencyContacts[0]?.name || ''}
                          onChange={(e) => {
                            const contacts = [...userProfile.emergencyContacts];
                            if (contacts[0]) {
                              contacts[0] = {...contacts[0], name: e.target.value};
                            } else {
                              contacts[0] = {userId: '', name: e.target.value};
                            }
                            setUserProfile({...userProfile, emergencyContacts: contacts});
                          }}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contact2">Contact 2 User ID</Label>
                        <Input 
                          id="contact2" 
                          placeholder="e.g., US67890" 
                          value={userProfile.emergencyContacts[1]?.userId || ''}
                          onChange={(e) => {
                            const contacts = [...userProfile.emergencyContacts];
                            if (contacts[1]) {
                              contacts[1] = {...contacts[1], userId: e.target.value};
                            } else {
                              contacts[1] = {userId: e.target.value, name: ''};
                              if (!contacts[0]) {
                                contacts[0] = {userId: '', name: ''};
                              }
                            }
                            setUserProfile({...userProfile, emergencyContacts: contacts});
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact2Name">Contact 2 Name</Label>
                        <Input 
                          id="contact2Name" 
                          placeholder="Second contact name" 
                          value={userProfile.emergencyContacts[1]?.name || ''}
                          onChange={(e) => {
                            const contacts = [...userProfile.emergencyContacts];
                            if (contacts[1]) {
                              contacts[1] = {...contacts[1], name: e.target.value};
                            } else {
                              contacts[1] = {userId: '', name: e.target.value};
                              if (!contacts[0]) {
                                contacts[0] = {userId: '', name: ''};
                              }
                            }
                            setUserProfile({...userProfile, emergencyContacts: contacts});
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch 
                        id="dnrStatus"
                        checked={userProfile.dnrStatus}
                        onCheckedChange={(checked) => setUserProfile({...userProfile, dnrStatus: checked})}
                      />
                      <Label htmlFor="dnrStatus">DNR (Do Not Resuscitate) Status</Label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="insuranceId">Insurance ID</Label>
                    <Input 
                      id="insuranceId" 
                      value={userProfile.insuranceId} 
                      onChange={(e) => setUserProfile({...userProfile, insuranceId: e.target.value})}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="physicianId">Primary Physician ID</Label>
                    <Input 
                      id="physicianId" 
                      placeholder="e.g., DR98765" 
                      value={userProfile.primaryPhysician.userId} 
                      onChange={(e) => setUserProfile({
                        ...userProfile, 
                        primaryPhysician: {...userProfile.primaryPhysician, userId: e.target.value}
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="physicianName">Primary Physician Name</Label>
                    <Input 
                      id="physicianName" 
                      value={userProfile.primaryPhysician.name} 
                      onChange={(e) => setUserProfile({
                        ...userProfile, 
                        primaryPhysician: {...userProfile.primaryPhysician, name: e.target.value}
                      })}
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={() => navigate('/')}>Cancel</Button>
                <Button 
                  onClick={handleSaveUserEmergencyInfo}
                  disabled={saving}
                  className="bg-lifetag-primary hover:bg-lifetag-dark"
                >
                  {saving ? 'Saving...' : 'Save & Continue'}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          
          {/* Doctor-Only Information Tab */}
          <TabsContent value="doctor-info">
            <Card>
              <CardHeader>
                <CardTitle>Medical Information</CardTitle>
                <CardDescription>
                  This information is only visible to authorized medical personnel
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="drinkingHabits">Drinking Habits</Label>
                    <Select 
                      value={userProfile.doctorOnlyInfo.drinkingHabits} 
                      onValueChange={(value) => setUserProfile({
                        ...userProfile, 
                        doctorOnlyInfo: {...userProfile.doctorOnlyInfo, drinkingHabits: value}
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select option" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="None">None</SelectItem>
                        <SelectItem value="Occasional">Occasional</SelectItem>
                        <SelectItem value="Moderate">Moderate</SelectItem>
                        <SelectItem value="Regular">Regular</SelectItem>
                        <SelectItem value="Heavy">Heavy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smokingHabits">Smoking Habits</Label>
                    <Select 
                      value={userProfile.doctorOnlyInfo.smokingHabits} 
                      onValueChange={(value) => setUserProfile({
                        ...userProfile, 
                        doctorOnlyInfo: {...userProfile.doctorOnlyInfo, smokingHabits: value}
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select option" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="No">No</SelectItem>
                        <SelectItem value="Occasional">Occasional</SelectItem>
                        <SelectItem value="Regular">Regular</SelectItem>
                        <SelectItem value="Heavy">Heavy</SelectItem>
                        <SelectItem value="Former smoker">Former smoker</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <Label>Current Medications</Label>
                  {medications.map((medication, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Input
                        value={medication}
                        onChange={(e) => handleFieldChange(index, e.target.value, medications, setMedications)}
                        placeholder="Enter medication"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => handleRemoveField(index, medications, setMedications)}
                        disabled={medications.length <= 1}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => handleAddField(medications, setMedications)}
                    className="mt-2"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Medication
                  </Button>
                </div>
                
                <div className="space-y-3">
                  <Label>Current Illnesses or Disorders</Label>
                  {illnesses.map((illness, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Input
                        value={illness}
                        onChange={(e) => handleFieldChange(index, e.target.value, illnesses, setIllnesses)}
                        placeholder="Enter illness or disorder"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => handleRemoveField(index, illnesses, setIllnesses)}
                        disabled={illnesses.length <= 1}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => handleAddField(illnesses, setIllnesses)}
                    className="mt-2"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Illness
                  </Button>
                </div>
                
                <div className="space-y-3">
                  <Label>Previous Surgeries</Label>
                  {surgeries.map((surgery, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Input
                        value={surgery}
                        onChange={(e) => handleFieldChange(index, e.target.value, surgeries, setSurgeries)}
                        placeholder="Enter surgery (include year if known)"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => handleRemoveField(index, surgeries, setSurgeries)}
                        disabled={surgeries.length <= 1}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => handleAddField(surgeries, setSurgeries)}
                    className="mt-2"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Surgery
                  </Button>
                </div>
                
                <Separator className="my-4" />
                
                <div>
                  <h3 className="text-lg font-medium mb-4">Last Physical Checkup</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="weight">Weight (kg)</Label>
                      <Input
                        id="weight"
                        type="number"
                        value={userProfile.doctorOnlyInfo.lastCheckup.weight || ''}
                        onChange={(e) => setUserProfile({
                          ...userProfile,
                          doctorOnlyInfo: {
                            ...userProfile.doctorOnlyInfo,
                            lastCheckup: {
                              ...userProfile.doctorOnlyInfo.lastCheckup,
                              weight: parseFloat(e.target.value) || 0
                            }
                          }
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bmi">BMI</Label>
                      <Input
                        id="bmi"
                        type="number"
                        step="0.1"
                        value={userProfile.doctorOnlyInfo.lastCheckup.bmi || ''}
                        onChange={(e) => setUserProfile({
                          ...userProfile,
                          doctorOnlyInfo: {
                            ...userProfile.doctorOnlyInfo,
                            lastCheckup: {
                              ...userProfile.doctorOnlyInfo.lastCheckup,
                              bmi: parseFloat(e.target.value) || 0
                            }
                          }
                        })}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="sugar">Blood Sugar (mg/dL)</Label>
                      <Input
                        id="sugar"
                        type="number"
                        value={userProfile.doctorOnlyInfo.lastCheckup.sugar || ''}
                        onChange={(e) => setUserProfile({
                          ...userProfile,
                          doctorOnlyInfo: {
                            ...userProfile.doctorOnlyInfo,
                            lastCheckup: {
                              ...userProfile.doctorOnlyInfo.lastCheckup,
                              sugar: parseInt(e.target.value) || 0
                            }
                          }
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bp">Blood Pressure (systolic/diastolic)</Label>
                      <Input
                        id="bp"
                        placeholder="e.g., 120/80"
                        value={userProfile.doctorOnlyInfo.lastCheckup.bp}
                        onChange={(e) => setUserProfile({
                          ...userProfile,
                          doctorOnlyInfo: {
                            ...userProfile.doctorOnlyInfo,
                            lastCheckup: {
                              ...userProfile.doctorOnlyInfo.lastCheckup,
                              bp: e.target.value
                            }
                          }
                        })}
                      />
                    </div>
                  </div>
                </div>
                
                <Separator className="my-4" />
                
                <div className="bg-gray-50 p-4 rounded-md">
                  <h3 className="text-lg font-medium mb-4">Verification Required</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    To save medical information, both your password and your primary physician's password are required.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="userPassword">Your Password</Label>
                      <Input
                        id="userPassword"
                        type="password"
                        value={userPasswordConfirm}
                        onChange={(e) => setUserPasswordConfirm(e.target.value)}
                        placeholder="Enter your password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="doctorPassword">Doctor's Password</Label>
                      <Input
                        id="doctorPassword"
                        type="password"
                        value={doctorPassword}
                        onChange={(e) => setDoctorPassword(e.target.value)}
                        placeholder="Enter doctor's password"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={() => navigate('/')}>Cancel</Button>
                <Button 
                  onClick={handleSaveDoctorOnlyInfo}
                  disabled={saving}
                  className="bg-lifetag-primary hover:bg-lifetag-dark"
                >
                  {saving ? 'Saving...' : 'Save Medical Information'}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      )}
      
      {/* Doctor Profile Form */}
      {currentUser.role === 'DOCTOR' && doctorProfile && (
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>Doctor Profile</CardTitle>
            <CardDescription>
              Update your professional information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="doctorId">Doctor ID</Label>
                <Input id="doctorId" value={doctorProfile.userId} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doctorName">Full Name</Label>
                <Input 
                  id="doctorName" 
                  value={doctorProfile.name} 
                  onChange={(e) => setDoctorProfile({...doctorProfile, name: e.target.value})}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contactInfo">Contact Information</Label>
                <Input 
                  id="contactInfo" 
                  placeholder="Phone number or email" 
                  value={doctorProfile.contactInfo} 
                  onChange={(e) => setDoctorProfile({...doctorProfile, contactInfo: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medicalLicenseNumber">Medical License Number</Label>
                <Input id="medicalLicenseNumber" value={doctorProfile.medicalLicenseNumber} disabled />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="hospitalClinic">Hospital/Clinic</Label>
              <Input 
                id="hospitalClinic" 
                placeholder="Enter your affiliated hospital or clinic" 
                value={doctorProfile.hospitalClinic} 
                onChange={(e) => setDoctorProfile({...doctorProfile, hospitalClinic: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="specialty">Specialty</Label>
              <Input 
                id="specialty" 
                placeholder="E.g., Cardiology, Pediatrics, etc." 
                value={doctorProfile.specialty} 
                onChange={(e) => setDoctorProfile({...doctorProfile, specialty: e.target.value})}
              />
            </div>
            
            <div className="space-y-3">
              <Label>Qualifications</Label>
              {qualifications.map((qualification, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <Input
                    value={qualification}
                    onChange={(e) => handleFieldChange(index, e.target.value, qualifications, setQualifications)}
                    placeholder="Enter qualification"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={() => handleRemoveField(index, qualifications, setQualifications)}
                    disabled={qualifications.length <= 1}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => handleAddField(qualifications, setQualifications)}
                className="mt-2"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Qualification
              </Button>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={() => navigate('/')}>Cancel</Button>
            <Button 
              onClick={handleSaveDoctorProfile}
              disabled={saving}
              className="bg-lifetag-primary hover:bg-lifetag-dark"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          </CardFooter>
        </Card>
      )}
      
      {/* First Responder Profile Form */}
      {currentUser.role === 'FIRST_RESPONDER' && firstResponderProfile && (
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>First Responder Profile</CardTitle>
            <CardDescription>
              Update your professional information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="frId">First Responder ID</Label>
                <Input id="frId" value={firstResponderProfile.userId} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="frName">Full Name</Label>
                <Input 
                  id="frName" 
                  value={firstResponderProfile.name} 
                  onChange={(e) => setFirstResponderProfile({...firstResponderProfile, name: e.target.value})}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="occupation">Occupation</Label>
                <Input 
                  id="occupation" 
                  value={firstResponderProfile.occupation} 
                  onChange={(e) => setFirstResponderProfile({...firstResponderProfile, occupation: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="frContactInfo">Contact Information</Label>
                <Input 
                  id="frContactInfo" 
                  placeholder="Phone number or email" 
                  value={firstResponderProfile.contactInfo} 
                  onChange={(e) => setFirstResponderProfile({...firstResponderProfile, contactInfo: e.target.value})}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agency">Agency</Label>
                <Input 
                  id="agency" 
                  placeholder="Enter your agency" 
                  value={firstResponderProfile.agency} 
                  onChange={(e) => setFirstResponderProfile({...firstResponderProfile, agency: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agencyId">Agency ID</Label>
                <Input 
                  id="agencyId" 
                  placeholder="Enter your agency ID" 
                  value={firstResponderProfile.agencyId} 
                  onChange={(e) => setFirstResponderProfile({...firstResponderProfile, agencyId: e.target.value})}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="organizationType">Organization Type</Label>
              <Select 
                value={firstResponderProfile.organizationType} 
                onValueChange={(value: any) => setFirstResponderProfile({
                  ...firstResponderProfile, 
                  organizationType: value
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Government">Government</SelectItem>
                  <SelectItem value="Private">Private</SelectItem>
                  <SelectItem value="Government Funded">Government Funded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="qualification">Qualification</Label>
              <Textarea 
                id="qualification" 
                placeholder="Enter your qualifications" 
                value={firstResponderProfile.qualification} 
                onChange={(e) => setFirstResponderProfile({...firstResponderProfile, qualification: e.target.value})}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={() => navigate('/')}>Cancel</Button>
            <Button 
              onClick={handleSaveFirstResponderProfile}
              disabled={saving}
              className="bg-lifetag-primary hover:bg-lifetag-dark"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
};

export default EditProfile;
