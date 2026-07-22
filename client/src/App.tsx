import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import EditProfile from "@/pages/EditProfile";
import EmergencyInfo from "@/pages/EmergencyInfo";
import MedicalInfo from "@/pages/MedicalInfo";
import MyContacts from "@/pages/MyContacts";
import MyDoctor from "@/pages/MyDoctor";
import TagTracer from "@/pages/TagTracer";
import AccountInfo from "@/pages/AccountInfo";
import Unauthorized from "@/pages/Unauthorized";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900">
            <Header />
            <main className="flex-grow">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/edit-profile" element={<EditProfile />} />
                <Route path="/emergency-info/:accountId" element={<EmergencyInfo />} />
                <Route path="/medical-info/:accountId" element={<MedicalInfo />} />
                <Route path="/my-contacts" element={<MyContacts />} />
                <Route path="/my-doctor" element={<MyDoctor />} />
                <Route path="/tag-tracer" element={<TagTracer />} />
                <Route path="/account-info" element={<AccountInfo />} />
                <Route path="/unauthorized" element={<Unauthorized />} />
                <Route path="/:accountId" element={<Login />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
