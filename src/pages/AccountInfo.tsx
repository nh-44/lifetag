
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import AuthGuard from '@/components/auth/AuthGuard';
import { useAuth } from '@/contexts/AuthContext';
import { currentUserService as userService } from '@/services/api';
import { UserAccount, isUserAccount, isDoctorAccount, isFirstResponderAccount } from '@/types/user';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ChevronRight, Heading1 } from 'lucide-react';

const AccountInfo = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const { user } = useAuth();
  const [accountData, setAccountData] = useState<UserAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDoctorInfo, setShowDoctorInfo] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!accountId) return;

    const fetchAccountData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // If the logged-in user is the account owner, redirect to edit profile
        if (user && isUserAccount(user) && user.account_id === accountId) {
          navigate('/edit-profile');
          return;
        }

        // Determine what data to fetch based on user role
        if (user && isDoctorAccount(user)) {
          // Doctors can see both emergency and doctor-only info
          const data = await userService.getDoctorInfo(accountId);
          setAccountData(data);
          setShowDoctorInfo(true);
        } else if (user && isFirstResponderAccount(user)) {
          // First responders can only see emergency info
          const data = await userService.getEmergencyInfo(accountId) as UserAccount;
          setAccountData(data);
          setShowDoctorInfo(false);
        } else {
          // Regular users shouldn't see this page, but just in case
          throw new Error('Unauthorized access');
        }
      } catch (error) {
        console.error('Error fetching account data:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch account information');
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : 'Failed to fetch account information',
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccountData();
  }, [accountId, user, navigate, toast]);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="medical-container py-16">
          <div className="max-w-3xl mx-auto text-center">
            <p>Loading account information...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="medical-container py-16">
          <div className="max-w-3xl mx-auto">
            <div className="medical-card bg-red-50 border-l-4 border-red-500">
              <div className="flex items-start p-4">
                <AlertTriangle className="h-6 w-6 text-red-500 mr-3 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-medium text-red-800">Access Error</h3>
                  <p className="text-red-700 mt-1">{error}</p>
                  <div className="mt-4">
                    <Button 
                      onClick={() => navigate('/')}
                      className="btn-primary"
                    >
                      Return to Home
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!accountData) {
    return (
      <MainLayout>
        <div className="medical-container py-16">
          <div className="max-w-3xl mx-auto text-center">
            <p>No account information found.</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <AuthGuard requireAuth={true}>
        <div className="medical-container py-16 animate-fade-in">
          <div className="max-w-3xl mx-auto">
            <div className="bg-medical text-white rounded-t-lg p-6">
              <div className="flex items-center gap-2 mb-1">
                <div className="bg-white text-medical font-bold px-2 py-0.5 text-xs rounded-md">
                  ACCOUNT ID: {accountId}
                </div>
                {accountData.dnr_status && (
                  <div className="bg-emergency text-white font-bold px-2 py-0.5 text-xs rounded-md">
                    DNR
                  </div>
                )}
              </div>
              <h1 className="text-3xl font-bold">{accountData.name}</h1>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3">
                <div>
                  <span className="text-white/70 text-sm">Age:</span>{' '}
                  <span className="font-medium">{accountData.age}</span>
                </div>
                <div>
                  <span className="text-white/70 text-sm">Blood Type:</span>{' '}
                  <span className="font-medium">{accountData.blood_group}</span>
                </div>
                <div>
                  <span className="text-white/70 text-sm">Insurance ID:</span>{' '}
                  <span className="font-medium">{accountData.insurance_id || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="medical-card rounded-t-none space-y-6">
              {/* Allergies Section */}
              <section>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">Allergies</h2>
                {accountData.allergies && accountData.allergies.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {accountData.allergies.map((allergy, index) => (
                      <div key={index} className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm">
                        {allergy}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No known allergies</p>
                )}
              </section>

              {/* Emergency Contacts Section */}
              <section>
                <h2 className="text-xl font-semibold text-gray-800 mb-3">Emergency Contacts</h2>
                {accountData.emergency_contacts && accountData.emergency_contacts.length > 0 ? (
                  <div className="space-y-2">
                    {accountData.emergency_contacts.map((contact, index) => (
                      <div key={index} className="flex items-center bg-gray-50 p-3 rounded-md">
                        <div className="flex-1">
                          <p className="font-medium">{contact}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No emergency contacts listed</p>
                )}
              </section>

              {/* Primary Physician Section */}
              {accountData.primary_physician && (
                <section>
                  <h2 className="text-xl font-semibold text-gray-800 mb-3">Primary Physician</h2>
                  <div className="bg-gray-50 p-3 rounded-md">
                    <p className="font-medium">{accountData.primary_physician}</p>
                  </div>
                </section>
              )}

              {/* Doctor-Only Information - Only shown to doctors */}
              {showDoctorInfo && accountData.doctor_only_info && (
                <>
                  <div className="border-t border-gray-200 pt-6">
                    <div className="bg-blue-50 border-l-4 border-medical p-4 mb-6">
                      <div className="flex">
                        <div className="ml-3">
                          <p className="text-sm text-medical-dark font-medium">
                            Physician-Only Information
                          </p>
                          <p className="text-sm text-medical-dark mt-1">
                            This section contains sensitive medical information only visible to authorized medical professionals.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Habits Section */}
                    <section className="mt-6">
                      <h2 className="text-xl font-semibold text-gray-800 mb-3">Habits</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-3 rounded-md">
                          <p className="text-sm text-gray-500">Drinking</p>
                          <p className="font-medium">{accountData.doctor_only_info.drinking_habits || 'Not specified'}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-md">
                          <p className="text-sm text-gray-500">Smoking</p>
                          <p className="font-medium">{accountData.doctor_only_info.smoking_habits || 'Not specified'}</p>
                        </div>
                      </div>
                    </section>

                    {/* Current Medications Section */}
                    <section className="mt-6">
                      <h2 className="text-xl font-semibold text-gray-800 mb-3">Current Medications</h2>
                      {accountData.doctor_only_info.medications && accountData.doctor_only_info.medications.length > 0 ? (
                        <div className="space-y-2">
                          {accountData.doctor_only_info.medications.map((medication, index) => (
                            <div key={index} className="bg-gray-50 p-3 rounded-md">
                              <p>{medication}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">No current medications</p>
                      )}
                    </section>

                    {/* Current Illnesses Section */}
                    <section className="mt-6">
                      <h2 className="text-xl font-semibold text-gray-800 mb-3">Current Illnesses or Disorders</h2>
                      {accountData.doctor_only_info.illnesses && accountData.doctor_only_info.illnesses.length > 0 ? (
                        <div className="space-y-2">
                          {accountData.doctor_only_info.illnesses.map((illness, index) => (
                            <div key={index} className="bg-gray-50 p-3 rounded-md">
                              <p>{illness}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">No current illnesses recorded</p>
                      )}
                    </section>

                    {/* Previous Surgeries Section */}
                    <section className="mt-6">
                      <h2 className="text-xl font-semibold text-gray-800 mb-3">Previous Surgeries</h2>
                      {accountData.doctor_only_info.surgeries && accountData.doctor_only_info.surgeries.length > 0 ? (
                        <div className="space-y-2">
                          {accountData.doctor_only_info.surgeries.map((surgery, index) => (
                            <div key={index} className="bg-gray-50 p-3 rounded-md">
                              <p>{surgery}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">No previous surgeries recorded</p>
                      )}
                    </section>

                    {/* Last Checkup Section */}
                    <section className="mt-6">
                      <h2 className="text-xl font-semibold text-gray-800 mb-3">Last Physical Checkup</h2>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gray-50 p-3 rounded-md">
                          <p className="text-sm text-gray-500">Weight (kg)</p>
                          <p className="font-medium">{accountData.doctor_only_info.last_checkup.weight || 'N/A'}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-md">
                          <p className="text-sm text-gray-500">BMI</p>
                          <p className="font-medium">{accountData.doctor_only_info.last_checkup.bmi || 'N/A'}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-md">
                          <p className="text-sm text-gray-500">Blood Sugar</p>
                          <p className="font-medium">{accountData.doctor_only_info.last_checkup.sugar || 'N/A'}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-md">
                          <p className="text-sm text-gray-500">Blood Pressure</p>
                          <p className="font-medium">{accountData.doctor_only_info.last_checkup.bp || 'N/A'}</p>
                        </div>
                      </div>
                    </section>
                  </div>
                </>
              )}

              <div className="border-t border-gray-200 pt-6">
                <Button onClick={() => navigate('/')} className="w-full">
                  Return to Home
                </Button>
              </div>
            </div>
          </div>
        </div>
      </AuthGuard>
    </MainLayout>
  );
};

export default AccountInfo;
