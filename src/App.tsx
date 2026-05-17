import React from 'react';
import { useAuth } from './hooks/useAuth'; // Assumed from your local setup hook
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Phone, ShieldCheck, User as UserIcon, Lock, ArrowLeft, KeyRound, Smartphone, Home, LogOut } from 'lucide-react';
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
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-16 h-16 bg-blue-600 rounded-2xl shadow-lg flex items-center justify-center text-white mb-4"
        >
          <Home size={32} />
        </motion.div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">OMAXE HEIGHTS</h1>
        <p className="text-xs text-slate-400 mt-1 font-mono">Securing system runtime environment...</p>
      </div>
    );
  }

  // --- RENDERING ROUTE CONTROL ---
  // Route A: Render the full, beautifully-styled Admin Dashboard
  if (forcedDashboardBypass || user) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans antialiased text-slate-900">
        {/* CRIsP, HIGH-CONTRAST TOP BAR */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold shadow-md shadow-blue-100">
              H
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 tracking-tight leading-tight">RESIDENT PORTAL</h1>
              <p className="text-xs text-slate-500 font-medium">Verified System Access</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="bg-rose-50 text-rose-600 text-xs font-bold px-3 py-1 rounded-full uppercase border border-rose-100 tracking-wide">
              Master Admin
            </span>
            <div className="text-right hidden sm:block">
              <p className="text-[11px] text-slate-400 font-medium leading-none mb-1">Welcome,</p>
              <p className="text-sm font-bold text-slate-800 leading-none">{user?.displayName || 'ASHWANI SIKKA'}</p>
            </div>
            <button className="text-slate-400 hover:text-rose-600 transition-colors p-1" title="Sign Out">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* METRICS CARD SYSTEM DISPLAY */}
        <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Resident Base</p>
                <h3 className="text-3xl font-black text-slate-900 mt-1">1</h3>
              </div>
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold text-sm">1</div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Authority Board</p>
                <h3 className="text-3xl font-black text-orange-600 mt-1">1</h3>
              </div>
              <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center font-bold text-sm">1</div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">New Arrivals</p>
                <h3 className="text-3xl font-black text-emerald-600 mt-1">1</h3>
              </div>
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold text-sm">1</div>
            </div>
          </div>

          {/* HIGH-READABILITY DIRECTORY LISTING */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 tracking-tight border-b border-slate-100 pb-3">
              Resident Directory
            </h2>
            <div className="mt-4 p-4 border border-slate-100 bg-slate-50/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-blue-600 text-white font-bold rounded-full flex items-center justify-center text-base shadow-sm">
                  A
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-slate-800">{user?.displayName || 'ASHWANI SIKKA'}</h4>
                    <span className="text-[10px] font-mono font-bold bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">OMAXE-6574</span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">{user?.email || 'ashwani.sikka@gmail.com'} • Male • +91 9996403643</p>
                </div>
              </div>
              <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 sm:gap-1">
                <span className="bg-amber-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded uppercase tracking-wider">Admin</span>
                <p className="text-[11px] text-slate-400 font-medium">Registered: May 16, 2026</p>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // Route B: Login View Card Flow
  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-slate-950">
      <div className="absolute inset-0 z-0 opacity-40">
        <img 
          alt="Omaxe Heights Luxury Building" 
          className="w-full h-full object-cover scale-105 filter blur-[2px]" 
          src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=2000" 
        />
      </div>
      <div className="relative z-10 w-full max-w-md">
        <Card className="bg-white shadow-2xl border-0 rounded-2xl overflow-hidden p-6">
          <CardHeader className="space-y-1 text-center pb-4">
            <CardTitle className="text-2xl font-black tracking-tight text-slate-900">Omaxe Heights</CardTitle>
            <CardDescription className="text-sm text-slate-500">Sign in to connect with society management</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mobile Number Verification</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <Input type="tel" placeholder="Enter 10-digit mobile number" className="pl-10 h-11 border-slate-200 focus-visible:ring-blue-600 text-slate-900" />
              </div>
            </div>
            <Button className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-md shadow-blue-100">
              Verify Device Link
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AppContent;
