
import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';

// This is just a redirect component since we've moved the homepage to Home.tsx
const Index = () => {
  useEffect(() => {
    console.log('Redirecting from Index to Home component');
  }, []);
  
  return <Navigate to="/" replace />;
};

export default Index;
