import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Dashboard } from './components/Dashboard';
import { AuthScreen } from './components/AuthScreen';
import { ProfileSetup } from './components/ProfileSetup';
import { Toaster } from 'sonner';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Phone, ShieldCheck, User as UserIcon, Lock, ArrowLeft, KeyRound, Smartphone, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

function AppContent() {
  const { user, profile, loading, isSessionVerified } = useAuth();

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

  if (!user) {
    return <AuthScreen />;
  }

  // Mandatory Setup & Session Verification Check:
  const needsVerification = !profile || profile.isSetupComplete !== true || !isSessionVerified;
  
  if (needsVerification) {
    return <ProfileSetup />;
  }

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
