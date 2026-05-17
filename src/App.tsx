import React from 'react';
import { useAuth } from './hooks/useAuth'; // Assumed from your local setup hook
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Phone, ShieldCheck, User as UserIcon, Lock, ArrowLeft, KeyRound, Smartphone, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

function AppContent() {
  const { user, profile, loading, isSessionVerified } = useAuth();
  const [biometricChecking, setBiometricChecking] = React.useState(true);
  const [forcedDashboardBypass, setForcedDashboardBypass] = React.useState(false);

  // --- BIOMETRIC FINGERPRINT LOGIC ---
  React.useEffect(() => {
    const checkBiometrics = async () => {
      try {
        if (window.PublicKeyCredential) {
          const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          
          if (available) {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            const assertion = await navigator.credentials.get({
              publicKey: {
                challenge,
                rpId: window.location.hostname,
                userVerification: "required"
              }
            });

            if (assertion) {
              // If fingerprint authentication succeeds, trigger our bypass state flag
              setForcedDashboardBypass(true);
              toast.success("Biometric authentication successful!");
            }
          }
        }
      } catch (err) {
        console.log("Biometric bypass skipped or canceled:", err);
      } finally {
        setBiometricChecking(false);
      }
    };

    const timer = setTimeout(() => {
      checkBiometrics();
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  if (loading || biometricChecking) {
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

  // --- RENDERING ROUTE CONTROL ---
  // If biometric print matches, jump straight to dashboard, skipping registration/phone states
  if (forcedDashboardBypass) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-6">
        {/* Your Dashboard Layout Component goes here */}
        <div className="max-w-md mx-auto mt-10 p-6 bg-gray-800 rounded-xl shadow-lg text-center">
          <h1 className="text-2xl font-bold mb-2">Welcome Back!</h1>
          <p className="text-gray-400">Authenticated securely via Device Biometrics.</p>
        </div>
      </div>
    );
  }

  // Fallback to normal rendering cycle from your original file structure
  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-gray-900">
      <div className="absolute inset-0 z-0">
        <img 
          alt="Omaxe Heights Luxury Building" 
          className="w-full h-full object-cover opacity-50 scale-105" 
          src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=2000" 
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-indigo-900/40 to-black/80"></div>
      </div>
      <div className="relative z-10 w-full max-w-md style={{opacity: 1, transform: 'none'}}">
        {/* Original login portal sub-layout cards continue here */}
        <Card className="bg-white/95 backdrop-blur shadow-2xl border-0">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold tracking-tight text-gray-900">Residential Hub</CardTitle>
            <CardDescription>Sign in to connect with your society management</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {/* Login fields display here */}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AppContent;
