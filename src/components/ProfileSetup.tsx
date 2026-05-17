import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Phone, User, Mail, ShieldCheck, ArrowRight, Smartphone, Home, Sparkles, Check } from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar';
import { getAvatarUrl } from '../lib/utils';

export function ProfileSetup() {
  const { profile, refreshProfile, challengeUser, user, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    displayName: '',
    phoneNumber: '',
    gender: '' as 'male' | 'female' | ''
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const BadWords = ['fuck', 'shit', 'asshole', 'bitch', 'bastard', 'cunt', 'piss', 'dick'];

  // Sync state if profile exists - FORCE re-entry
  React.useEffect(() => {
    if (profile) {
      setFormData(prev => ({
        // We leave everything blank initially to force fresh entry as per request
        displayName: prev.displayName || '',
        phoneNumber: prev.phoneNumber || '',
        gender: prev.gender || ''
      }));
    }
  }, [profile]);

  const handleNext = async () => {
    if (step === 1) {
      if (!formData.phoneNumber.match(/^[6-9]\d{9}$/)) {
        toast.error("Invalid Mobile Number", {
          description: "Please enter a valid 10-digit mobile number."
        });
        return;
      }
      setStep(2);
    } else if (step === 2) {
      const name = formData.displayName.trim();
      
      if (!name || !formData.gender) {
        toast.error("Information Required", {
          description: "Full name and gender selection are mandatory."
        });
        return;
      }

      // Strict Alphabetic Validation
      if (!/^[a-zA-Z\s]+$/.test(name)) {
        toast.error("Invalid Name", {
          description: "Full name must contain only alphabetic characters (A-Z)."
        });
        return;
      }

      // Profanity Filter
      const hasBadWord = BadWords.some(word => name.toLowerCase().includes(word));
      if (hasBadWord) {
        toast.error("Invalid Content", {
          description: "Please use a professional and respectful name."
        });
        return;
      }

      if (!agreedToTerms) {
        toast.error("Security Agreement", {
          description: "Please accept the security disclaimer to proceed."
        });
        return;
      }
      
      setStep(3); // To security challenge
    }
  };

  const handleSecurityChallenge = async () => {
    setLoading(true);
    try {
      // Free Google Native Security Challenge
      toast.info("Secure Gateway: Validating device identity...", { duration: 3000 });
      await challengeUser();

      if (user) {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          displayName: formData.displayName,
          phoneNumber: formData.phoneNumber,
          gender: formData.gender,
          phoneVerified: true,
          isSetupComplete: true,
          updatedAt: serverTimestamp()
        });
        await refreshProfile();
        toast.success("Identity Verified. Portal Unlocked!");
      }
    } catch (error: any) {
      console.error("Verification failed:", error);
      if (error.code === 'auth/user-mismatch' || error.message?.includes('user-mismatch')) {
        toast.error("Identity Mismatch", {
          description: `Must use the same Google account (${user?.email}) to verify identity.`,
          duration: 6000
        });
      } else if (error.code === 'auth/popup-closed-by-user') {
        toast.error("Verification Cancelled", { description: "Challenge is mandatory." });
      } else {
        toast.error("Verification Failed", { description: "Device identity check failed. Try again." });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-gray-900">
      
      {/* Background from Landing Page */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&q=80&w=2000" 
          alt="Background"
          className="w-full h-full object-cover opacity-50 scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-indigo-900/40 to-black/80" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)] bg-white/95 backdrop-blur-2xl overflow-hidden rounded-[2.5rem]">
          <div className="h-40 bg-indigo-600 flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
               <div className="absolute -inset-[100%] bg-[radial-gradient(circle,white_1px,transparent_1px)] bg-[size:20px_20px]" />
            </div>
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-2xl relative z-10"
            >
              <Home size={28} strokeWidth={2.5} />
            </motion.div>
          </div>
          
          <CardHeader className="text-center pt-10 pb-6 px-6 sm:px-10">
            <CardTitle className="text-3xl font-black text-gray-900 tracking-tighter uppercase font-display leading-none">
              Identity <span className="text-indigo-600 italic">Activation</span>
            </CardTitle>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mt-2">
              Mandatory Safety Registration
            </p>
          </CardHeader>

          <CardContent className="px-6 sm:px-10 pb-10 space-y-6">
            <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 mb-2">
              <p className="text-[10px] text-indigo-900 font-bold uppercase tracking-widest leading-relaxed text-center">
                Step {step} of 3: {step === 1 ? 'Mobile Binding' : step === 2 ? 'Personal Details' : 'Identity Verification'}
              </p>
            </div>

            <div className="space-y-4">
              {/* Step 1: Mobile Number */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2 font-display">SIM Mobile Number</Label>
                    <div className="relative">
                      <Smartphone className="absolute left-5 top-1/2 -translate-y-1/2 text-indigo-600" size={18} />
                      <Input 
                        type="tel"
                        value={formData.phoneNumber} 
                        onChange={e => setFormData({...formData, phoneNumber: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                        className="pl-12 h-14 rounded-2xl bg-slate-50 border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-100 font-bold tracking-[0.2em] transition-all text-sm"
                        placeholder="10-digit mobile number"
                        autoComplete="off"
                      />
                    </div>
                    <p className="text-[9px] text-gray-500 ml-2 font-bold italic uppercase tracking-wider">
                      Please enter the number linked to the SIM physically present in this device.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 2: Personal Info */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2 font-display">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-5 top-1/2 -translate-y-1/2 text-indigo-600" size={18} />
                      <Input 
                        value={formData.displayName} 
                        onChange={e => setFormData({...formData, displayName: e.target.value})}
                        autoComplete="off"
                        name="user_full_name_register"
                        className="pl-12 h-14 rounded-2xl bg-slate-50 border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-100 font-bold transition-all text-sm uppercase tracking-tight"
                        placeholder="Your official full name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2 block text-center">Gender Selection</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {['male', 'female'].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setFormData({...formData, gender: v as any})}
                          className={`h-14 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border-2 flex items-center justify-center gap-3 ${
                            formData.gender === v 
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100 scale-105' 
                              : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-200'
                          }`}
                        >
                          <span className="text-xl">{v === 'male' ? '👨' : '👩'}</span>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setAgreedToTerms(!agreedToTerms)}
                      className={`w-full p-4 rounded-2xl border-2 transition-all flex items-start gap-4 text-left ${
                        agreedToTerms 
                          ? 'bg-emerald-50 border-emerald-500 shadow-lg shadow-emerald-50' 
                          : 'bg-white border-slate-100 hover:border-indigo-200'
                      }`}
                    >
                      <div className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
                        agreedToTerms ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'
                      }`}>
                        {agreedToTerms && <Check size={14} strokeWidth={4} />}
                      </div>
                      <div className="space-y-1">
                        <p className={`text-[10px] font-black uppercase tracking-wider ${agreedToTerms ? 'text-emerald-700' : 'text-slate-600'}`}>
                          Security & Privacy Mandate
                        </p>
                        <p className="text-[9px] font-bold text-slate-400 leading-tight uppercase tracking-tight">
                          I solemnly affirm NOT TO SHARE sensitive credentials. I understand the importance of device binding.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Challenge */}
              {step === 3 && (
                <div className="space-y-6">
                  <div className="p-6 bg-emerald-50 rounded-[2rem] border-2 border-emerald-100 flex flex-col items-center text-center gap-4">
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-emerald-500 shadow-lg">
                      <ShieldCheck size={32} />
                    </div>
                    <div>
                      <p className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-1">Identity Challenge</p>
                      <p className="text-sm font-bold text-slate-900 leading-tight">Google SIM-Link / Security Check Required</p>
                      <p className="text-[10px] mt-3 font-bold text-emerald-600 uppercase">Verification for: {formData.phoneNumber}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4">
              {step < 3 ? (
                <Button 
                   onClick={handleNext}
                   disabled={loading}
                   className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-base rounded-2xl shadow-xl shadow-indigo-100 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                >
                   Continue
                   <ArrowRight size={20} />
                </Button>
              ) : (
                <Button 
                  onClick={handleSecurityChallenge}
                  disabled={loading}
                  className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base rounded-2xl shadow-xl shadow-emerald-100 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                >
                  {loading ? "Verifying..." : "Bind & Complete Identity"}
                  <ShieldCheck size={20} />
                </Button>
              )}
              
              <Button 
                variant="ghost" 
                onClick={logout}
                disabled={loading}
                className="w-full mt-4 text-[10px] font-bold uppercase text-gray-400 tracking-widest hover:text-red-500 transition-colors"
              >
                Cancel & Logout
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
