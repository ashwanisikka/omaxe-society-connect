import React from 'react';
import { AuthProvider, useAuth } from '@/src/contexts/AuthContext';
import { Dashboard } from '@/src/components/Dashboard';
import { AuthScreen } from '@/src/components/AuthScreen';
import { ProfileSetup } from '@/src/components/ProfileSetup';
import { Toaster } from 'sonner';
import { Home } from 'lucide-react';
import { motion } from 'motion/react';

// Main Application Route Guard Controls
function AppContent() {
  const { user, profile, loading, isSessionVerified, isDeviceAuthorized } = useAuth();

  // 1. Initial Handshake loading state (Firebase dynamic token check)
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-16 h-16 bg-indigo-600 rounded-2xl shadow-xl flex items-center justify-center text-white mb-6"
        >
          <Home size={32} />
        </motion.div>
        <p className="text-gray-900 font-black text-xl uppercase tracking-tighter italic">Omaxe Heights</p>
        <div className="mt-4 flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
              className="w-1.5 h-1.5 bg-indigo-500 rounded-full"
            />
          ))}
        </div>
      </div>
    );
  }

  // 2. STEP 1: Google login validation check (Forces user to landing/login screen first)
  if (!user) {
    return <AuthScreen />;
  }

  // 3. STEP 2: Device-binding and session security check
  // isSessionVerified aur isDeviceAuthorized dono ke checks ko sync kiya hai routing loop bypass karne ke liye
  const verified = isSessionVerified || isDeviceAuthorized;
  const needsVerification = !profile || profile.isSetupComplete !== true || !verified;
  
  if (needsVerification) {
    console.log("[Router] Identity setup or hardware handshake pending. Redirecting to ProfileSetup.");
    return <ProfileSetup />;
  }

  // 4. STEP 3: All secure constraints satisfied! Show active Dashboard to resident
  console.log("[Router] Security verified. Moving to resident portal board.");
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
