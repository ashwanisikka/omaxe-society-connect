import React from 'react';
import { AuthProvider, useAuth } from '@/src/contexts/AuthContext';
import { Dashboard } from '@/src/components/Dashboard';
import { AuthScreen } from '@/src/components/AuthScreen';
import { ProfileSetup } from '@/src/components/ProfileSetup';
import { Toaster } from 'sonner';
import { Home } from 'lucide-react';
import { motion } from 'motion/react';

function AppContent() {
  const { user, profile, loading, isSessionVerified, isDeviceAuthorized } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <motion.div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-6">
          <Home size={32} />
        </motion.div>
        <p className="text-gray-900 font-black text-xl uppercase">Omaxe Heights</p>
        {/* Branding on Loading Screen */}
        <p className="mt-4 text-[9px] font-black text-slate-400 tracking-[0.2em] uppercase">Powered by Ashwani Sikka</p>
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  const verified = isSessionVerified || isDeviceAuthorized;
  const needsVerification = !profile || profile.isSetupComplete !== true || !verified;
  
  if (needsVerification) return <ProfileSetup />;

  return <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
      <Toaster position="top-center" richColors closeButton />
    </AuthProvider>
  );
}
