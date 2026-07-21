
import { Link } from 'react-router-dom';
import { Github } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-gray-100 pt-12 pb-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <Link to="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full lifetag-gradient flex items-center justify-center text-white font-bold">
                LT
              </div>
              <span className="text-2xl font-bold text-lifetag-primary">LifeTag</span>
            </Link>
            <p className="mt-4 text-gray-600">
              Access critical medical information instantly with NFC technology.
              LifeTag keeps your medical data secure and accessible when needed most.
            </p>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/" className="text-gray-600 hover:text-lifetag-primary">Home</Link>
              </li>
              <li>
                <Link to="/login" className="text-gray-600 hover:text-lifetag-primary">Login</Link>
              </li>
              <li>
                <Link to="/signup" className="text-gray-600 hover:text-lifetag-primary">Sign Up</Link>
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Contact</h3>
            <p className="text-gray-600">Have questions about LifeTag?</p>
            <a href="mailto:contact@lifetag.com" className="text-lifetag-primary hover:underline">
              contact@lifetag.com
            </a>
          </div>
        </div>
        
        <div className="border-t border-gray-200 mt-8 pt-6 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-600 text-sm">
            &copy; {new Date().getFullYear()} LifeTag. All rights reserved.
          </p>
          
          <div className="mt-4 md:mt-0">
            <p className="text-sm text-gray-600">
              Created by: Naveen S, Nandita R Nadig, Preksha K, Navyashree SP
            </p>
            <div className="flex items-center mt-2">
              <a 
                href="https://github.com/your-repo/lifetag" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center text-gray-600 hover:text-lifetag-primary"
              >
                <Github size={16} className="mr-1" />
                <span className="text-sm">GitHub Repository</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
