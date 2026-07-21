
import React, { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { UserCircle, LogOut, Settings, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface MainLayoutProps {
  children: ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { user, logout, isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white shadow">
        <div className="medical-container py-4">
          <div className="flex justify-between items-center">
            <Link to="/" className="text-xl font-bold text-medical">
              NFC Health Connect
            </Link>
            
            <div>
              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md hover:bg-gray-100">
                    <UserCircle className="h-5 w-5" />
                    <span>{user?.name}</span>
                    <ChevronDown className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium">{user?.name}</p>
                      <p className="text-xs text-gray-500">{user?.user_id}</p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/edit-profile" className="cursor-pointer w-full flex items-center">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Edit Profile</span>
                      </Link>
                    </DropdownMenuItem>
                    {user?.role === 'user' && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link to="/my-contacts" className="cursor-pointer w-full">
                            My Contacts
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/my-doctor" className="cursor-pointer w-full">
                            My Doctor
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="text-red-600 cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Logout</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="flex gap-4">
                  <Link
                    to="/login"
                    className="text-medical hover:text-medical-dark font-medium"
                  >
                    Log in
                  </Link>
                  <Link
                    to="/signup"
                    className="btn-primary"
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow">
        {children}
      </main>

      <footer className="bg-gray-50 border-t">
        <div className="medical-container py-8">
          <div className="text-center">
            <p className="text-gray-500 text-sm">
              © {new Date().getFullYear()} NFC Health Connect
            </p>
            <p className="text-gray-500 text-sm mt-2">
              Authors: Naveen S, Nandita R Nadig, Preksha K, Navyashree SP
            </p>
            <p className="mt-2">
              <a 
                href="https://github.com/your-repo/nfc-health-connect" 
                className="text-medical hover:underline text-sm"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub Repository
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MainLayout;
