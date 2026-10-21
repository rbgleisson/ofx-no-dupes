import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import ErrorBoundary from "@/components/ErrorBoundary";
import { OrganizationContext, useOrganizationLoader } from "@/hooks/useOrganization";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import LandingPage from "./pages/LandingPage";
import ResetPassword from "./pages/ResetPassword";
import AdminPanel from "./pages/AdminPanel";
import OrgSettings from "./pages/OrgSettings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children, session }: { children: React.ReactNode; session: Session | null }) {
  if (!session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const AppRoutes = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showOrgSettings, setShowOrgSettings] = useState(false);
  const navigate = useNavigate();
  const orgContext = useOrganizationLoader();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
        setSession(session);
        setLoading(false);
        navigate('/reset-password');
        return;
      }
      setSession(session);
      setLoading(false);
      if (event === 'SIGNED_IN' && session && !isRecovery && window.location.pathname !== '/app') {
        navigate('/app');
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading || (session && orgContext.loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (showOrgSettings && session) {
    return (
      <OrganizationContext.Provider value={orgContext}>
        <OrgSettings onBack={() => setShowOrgSettings(false)} />
      </OrganizationContext.Provider>
    );
  }

  if (showAdmin && session) {
    return (
      <OrganizationContext.Provider value={orgContext}>
        <AdminPanel onBack={() => setShowAdmin(false)} />
      </OrganizationContext.Provider>
    );
  }

  return (
    <OrganizationContext.Provider value={orgContext}>
      <Routes>
        <Route path="/" element={
          session && !isRecovery ? <Navigate to="/app" replace /> : <LandingPage onGetStarted={() => navigate('/auth')} />
        } />
        <Route path="/auth" element={
          session && !isRecovery ? <Navigate to="/app" replace /> : <Auth onBack={() => navigate('/')} />
        } />
        <Route path="/reset-password" element={<ResetPassword onPasswordUpdated={() => setIsRecovery(false)} />} />
        <Route path="/app" element={
          <ProtectedRoute session={session}>
            <Index
              onOpenAdmin={() => setShowAdmin(true)}
              onOpenOrgSettings={() => setShowOrgSettings(true)}
            />
          </ProtectedRoute>
        } />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </OrganizationContext.Provider>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
