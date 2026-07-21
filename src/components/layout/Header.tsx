import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  User, 
  LogOut, 
  ChevronDown, 
  Menu, 
  X, 
  Home, 
  UserCog, 
  Users, 
  UserCheck, 
  Trash2,
  Radio
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const Header = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleDeleteAccount = () => {
    logout();
    toast.success('Account deleted successfully');
    navigate('/');
  };

  return (
    <header className="bg-white shadow-sm z-10 relative">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center space-x-6">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold">
              LT
            </div>
            <span className="text-2xl font-bold text-blue-700">LifeTag</span>
          </Link>

          <Link to="/tag-tracer" className="hidden md:flex items-center space-x-1 text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">
            <Radio className="w-4 h-4 text-cyan-500" />
            <span>NFC Hardware Tools</span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-4">
          <Link to="/" className="text-gray-600 hover:text-blue-600 font-medium">
            Home
          </Link>
          {currentUser ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center space-x-2">
                  <User size={18} />
                  <span>{currentUser.name}</span>
                  <ChevronDown size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 mt-2 z-50">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/edit-profile')}>
                    <UserCog className="mr-2 h-4 w-4" />
                    <span>Edit Profile</span>
                  </DropdownMenuItem>
                  
                  {currentUser.role === 'USER' && (
                    <>
                      <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/my-contacts')}>
                        <Users className="mr-2 h-4 w-4" />
                        <span>My Contacts</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/my-doctor')}>
                        <UserCheck className="mr-2 h-4 w-4" />
                        <span>My Doctor</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem className="cursor-pointer text-destructive" onSelect={(e) => e.preventDefault()}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      <span>Delete Account</span>
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your
                        account and remove your data from our servers.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDeleteAccount}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="default" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate('/login')}>
              Login
            </Button>
          )}
        </nav>

        {/* Mobile Menu Button */}
        <div className="md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 absolute w-full z-50 shadow-md">
          <div className="container mx-auto py-4 px-6 space-y-3">
            <Link 
              to="/" 
              className="flex items-center space-x-2 p-2 rounded hover:bg-blue-50"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Home size={18} />
              <span>Home</span>
            </Link>
            <Link 
              to="/tag-tracer" 
              className="flex items-center space-x-2 p-2 rounded hover:bg-blue-50"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Radio size={18} />
              <span>NFC Hardware Tools</span>
            </Link>
            
            {currentUser ? (
              <>
                <Link 
                  to="/edit-profile" 
                  className="flex items-center space-x-2 p-2 rounded hover:bg-blue-50"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <UserCog size={18} />
                  <span>Edit Profile</span>
                </Link>
                
                {currentUser.role === 'USER' && (
                  <>
                    <Link 
                      to="/my-contacts" 
                      className="flex items-center space-x-2 p-2 rounded hover:bg-blue-50"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Users size={18} />
                      <span>My Contacts</span>
                    </Link>
                    <Link 
                      to="/my-doctor" 
                      className="flex items-center space-x-2 p-2 rounded hover:bg-blue-50"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <UserCheck size={18} />
                      <span>My Doctor</span>
                    </Link>
                  </>
                )}
                
                <button 
                  className="flex items-center space-x-2 p-2 rounded hover:bg-blue-50 w-full text-left"
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                >
                  <LogOut size={18} />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <Link 
                to="/login" 
                className="flex items-center space-x-2 p-2 bg-blue-600 text-white rounded"
                onClick={() => setMobileMenuOpen(false)}
              >
                <User size={18} />
                <span>Login</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
