
import { Link } from 'react-router-dom';
import { Shield, Smartphone, UserPlus, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const Home = () => {
  const { currentUser } = useAuth();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-lifetag-light to-white">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="md:w-1/2 mb-10 md:mb-0 md:pr-8">
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                Your Medical Information,
                <span className="text-lifetag-primary"> Instantly Accessible</span>
              </h1>
              <p className="text-lg text-gray-600 mb-6">
                LifeTag uses NFC technology to give emergency responders and healthcare 
                providers instant access to your critical medical information when seconds count.
              </p>
              <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
                {currentUser ? (
                  <Button 
                    size="lg" 
                    className="bg-lifetag-primary hover:bg-lifetag-dark"
                    asChild
                  >
                    <Link to="/edit-profile">
                      Manage Your Profile
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button 
                      size="lg" 
                      className="bg-lifetag-primary hover:bg-lifetag-dark"
                      asChild
                    >
                      <Link to="/signup">
                        Sign Up
                      </Link>
                    </Button>
                    <Button 
                      size="lg" 
                      variant="outline" 
                      className="border-lifetag-primary text-lifetag-primary hover:bg-lifetag-light"
                      asChild
                    >
                      <Link to="/login">
                        Login
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="md:w-1/2 flex justify-center">
              <div className="w-72 h-72 bg-white rounded-full shadow-xl p-4 animate-pulse-slow">
                <div className="w-full h-full rounded-full lifetag-gradient flex items-center justify-center">
                  <div className="text-white text-center">
                    <Smartphone size={48} className="mx-auto mb-2" />
                    <p className="text-xl font-bold">Tap to Access</p>
                    <p className="text-sm mt-1">Medical Information</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 bg-white" id="how-it-works">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              LifeTag makes accessing your medical information simple and secure.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="lifetag-card flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full lifetag-gradient flex items-center justify-center mb-4">
                <UserPlus className="text-white" size={24} />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gray-800">Create Your Profile</h3>
              <p className="text-gray-600">
                Register and create your secure medical profile with emergency and detailed medical information.
              </p>
            </div>
            
            <div className="lifetag-card flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full lifetag-gradient flex items-center justify-center mb-4">
                <Smartphone className="text-white" size={24} />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gray-800">Use Your NFC Tag</h3>
              <p className="text-gray-600">
                Attach your LifeTag NFC to a wristband, wallet, or phone case. When scanned, it provides your unique ID.
              </p>
            </div>
            
            <div className="lifetag-card flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full lifetag-gradient flex items-center justify-center mb-4">
                <Clock className="text-white" size={24} />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-gray-800">Instant Access</h3>
              <p className="text-gray-600">
                In an emergency, medical professionals can instantly access your critical information with a simple scan.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Security Feature Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center">
            <div className="md:w-1/2 mb-8 md:mb-0 md:pr-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Secure & Role-Based Access</h2>
              <p className="text-lg text-gray-600 mb-6">
                LifeTag uses advanced security features to ensure your medical information 
                is only accessible to authorized personnel.
              </p>
              <ul className="space-y-4">
                <li className="flex items-start">
                  <Shield className="text-lifetag-primary mr-3 mt-1 flex-shrink-0" size={20} />
                  <p className="text-gray-700">
                    <strong>Emergency Responders</strong> see only critical, life-saving information
                  </p>
                </li>
                <li className="flex items-start">
                  <Shield className="text-lifetag-primary mr-3 mt-1 flex-shrink-0" size={20} />
                  <p className="text-gray-700">
                    <strong>Doctors</strong> can access more detailed medical history with proper authorization
                  </p>
                </li>
                <li className="flex items-start">
                  <Shield className="text-lifetag-primary mr-3 mt-1 flex-shrink-0" size={20} />
                  <p className="text-gray-700">
                    <strong>You</strong> have complete control over your information at all times
                  </p>
                </li>
              </ul>
            </div>
            <div className="md:w-1/2 flex justify-center">
              <div className="relative">
                <div className="w-64 h-64 bg-lifetag-primary/10 rounded-lg"></div>
                <div className="w-64 h-64 bg-lifetag-primary/20 rounded-lg absolute top-6 left-6"></div>
                <div className="w-64 h-64 bg-white shadow-lg rounded-lg p-6 absolute top-12 left-12 border border-lifetag-primary/30">
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-200 rounded-full w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded-full"></div>
                    <div className="h-4 bg-gray-200 rounded-full w-5/6"></div>
                    <div className="h-12 mt-6 bg-lifetag-light rounded-lg border border-lifetag-primary/30 flex items-center justify-center">
                      <div className="w-5 h-5 rounded-full bg-lifetag-primary mr-2"></div>
                      <div className="h-3 bg-gray-300 rounded-full w-20"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lifetag-gradient">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Ready to Secure Your Medical Information?</h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Join thousands of people who trust LifeTag with their critical medical information.
          </p>
          {currentUser ? (
            <Button 
              size="lg" 
              className="bg-white text-lifetag-primary hover:bg-gray-100"
              asChild
            >
              <Link to="/edit-profile">
                Manage Your Profile
              </Link>
            </Button>
          ) : (
            <Button 
              size="lg" 
              className="bg-white text-lifetag-primary hover:bg-gray-100"
              asChild
            >
              <Link to="/signup">
                Get Started Now
              </Link>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
};

export default Home;
