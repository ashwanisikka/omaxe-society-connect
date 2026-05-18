import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signOut,
  RecaptchaVerifier,
  PhoneAuthProvider,
  linkWithCredential,
  User
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/src/lib/firebase';
import { UserProfile, UserRole } from '@/src/types';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: (e?: any) => void;
  signInWithGoogle: (e?: any) => void; // Alias 1: Button click compatibility
  signIn: (e?: any) => void;           // Alias 2: Button click compatibility
  login: (e?: any) => void;            // Alias 3: Button click compatibility
  logout: () => Promise<void>;
  signOutUser: () => Promise<void>;      // Alias 4: Logout compatibility
  verifyAndBindPhone: (phoneNumber: string) => Promise<boolean>;
  isDeviceAuthorized: boolean;            // Rollback stable state: Always true
  isSessionVerified: boolean;             // App.tsx router verification synchronizer
  isAdmin: boolean;
  isMasterAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeviceAuthorized] = useState(true); // Hamesha true taaki loops na banein
  const [isSessionVerified, setIsSessionVerified] = useState(false);

  // States for dynamic SMS OTP modal injection
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [pendingPhone, setPendingPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [otpError, setOtpError] = useState('');
  const [resolvePromise, setResolvePromise] = useState<(value: boolean) => void>();

  // Mount an invisible recaptcha container dynamically on DOM setup
  useEffect(() => {
    let recaptchaDiv = document.getElementById('recaptcha-container');
    if (!recaptchaDiv) {
      recaptchaDiv = document.createElement('div');
      recaptchaDiv.id = 'recaptcha-container';
      recaptchaDiv.style.display = 'none';
      document.body.appendChild(recaptchaDiv);
    }
  }, []);

  // Firestore DB synchronization handler
  const handleUserLogin = async (currentUser: User) => {
    try {
      console.log("[AuthContext] Syncing user data for:", currentUser.uid);
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        console.log("[AuthContext] Profile missing. Creating clean database record...");
        const newProfile: UserProfile = {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || 'Resident',
          role: 'user' as UserRole,
          createdAt: new Date().toISOString(),
          phoneVerified: false,
          phoneNumber: '',
          isSetupComplete: false
        };
        await setDoc(userDocRef, newProfile);
        setProfile(newProfile);
        setIsSessionVerified(false);
        toast.success("Google sign-in completed! Please setup your 10-digit mobile number.");
      } else {
        const userData = userDoc.data() as UserProfile;
        setProfile(userData);
        console.log("[AuthContext] Profile retrieved successfully:", userData.displayName);
        
        // Match verification state to let user land on dashboard
        if (userData.phoneVerified && userData.isSetupComplete) {
          setIsSessionVerified(true);
          toast.success(`Welcome back, ${userData.displayName || 'Resident'}!`);
        } else {
          setIsSessionVerified(false);
          toast.warning("Profile setup pending. Verification required.");
        }
      }
    } catch (err: any) {
      console.error("[AuthContext] Sync failed:", err);
      toast.error(`Database Error: ${err.message || 'Verification interrupted'}`);
    }
  };

  useEffect(() => {
    // 1. Resolve redirects automatically if popup is blocked
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          console.log("[AuthContext] Redirect login success!");
          setUser(result.user);
          await handleUserLogin(result.user);
        }
      })
      .catch((err) => {
        console.warn("[AuthContext] Redirect check bypassed:", err.message);
      });

    // 2. Persistent session watcher
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser);
          await handleUserLogin(currentUser);
        } else {
          setUser(null);
          setProfile(null);
          setIsSessionVerified(false);
        }
      } catch (err) {
        console.error("[AuthContext] State observer error:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Standard Google Popup Trigger (Synchronous gesture to prevent popup blocking)
  const executeGoogleAuth = (e?: any) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    console.log("[AuthContext] Initializing Google sign-in click gesture...");
    setLoading(true);
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    // Direct call ensures Chrome recognizes this as clean click gesture
    console.log("[AuthContext] Opening standard Google popup window...");
    signInWithPopup(auth, provider)
      .then(async (result) => {
        console.log("[AuthContext] Popup authorization successful!");
        setUser(result.user);
        await handleUserLogin(result.user);
      })
      .catch((popupErr: any) => {
        console.error("[AuthContext] Popup login error details:", popupErr.code);
        
        // If popup is blocked by custom extensions, fallback gracefully to redirect
        if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/cancelled-popup-request') {
          console.log("[AuthContext] Popup blocked! Attempting redirect login fallback...");
          toast.info("Opening Google login redirect screen...");
          signInWithRedirect(auth, provider).catch((redirectErr) => {
            console.error("[AuthContext] Redirect trigger failed:", redirectErr);
            toast.error("Google authentication blocked by browser settings.");
            setLoading(false);
          });
        } else if (popupErr.code === 'auth/unauthorized-domain') {
          toast.error("Vercel Domain unauthorized under Firebase settings!");
          setLoading(false);
        } else {
          toast.error(`Login failed: ${popupErr.message || 'Check popup settings.'}`);
          setLoading(false);
        }
      });
  };

  // Click action aliases
  const loginWithGoogle = executeGoogleAuth;
  const signInWithGoogle = executeGoogleAuth;
  const signIn = executeGoogleAuth;
  const login = executeGoogleAuth;

  // Sends SMS OTP and prompts verification overlay (completely self-contained!)
  const verifyAndBindPhone = async (phoneNumber: string): Promise<boolean> => {
    if (!user) {
      toast.error("Google session invalid. Please log in using Google first.");
      return false;
    }

    const sanitizedPhone = phoneNumber.trim().replace(/\D/g, '');

    // 1. MUST BE EXACTLY 10 DIGITS Check
    if (sanitizedPhone.length !== 10) {
      toast.error("Error: Kripya ek valid 10-digit mobile number enter kijiye!");
      return false;
    }

    // 2. MUST START WITH Indian mobile code patterns (6, 7, 8, 9)
    if (!/^[6-9]/.test(sanitizedPhone)) {
      toast.error("Error: Indian mobile numbers strictly 6, 7, 8, ya 9 se start hote hain!");
      return false;
    }

    // 3. BLOCK REPETITIVE FAKE PATTERNS (e.g. 9999999999, 1111111111)
    if (/^(\d)\1{9}$/.test(sanitizedPhone)) {
      toast.error("Error: Fake numbers (repetitive sequences) allow nahi hain!");
      return false;
    }

    // 4. BLOCK SEQUENTIAL FAKE PATTERNS (e.g. 1234567890, 0987654321, 9876543210)
    const sequentialCheck = "12345678909876543210";
    if (sequentialCheck.includes(sanitizedPhone)) {
      toast.error("Error: Sequential fake numbers allowed nahi hain!");
      return false;
    }

    toast.loading("Sending secure verification SMS...");

    try {
      // Setup Invisible reCAPTCHA verifier natively
      const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible'
      });

      const phoneProvider = new PhoneAuthProvider(auth);
      const formattedPhone = `+91${sanitizedPhone}`;
      
      // Request SMS OTP code from Google Gateway
      const vId = await phoneProvider.verifyPhoneNumber(formattedPhone, verifier);

      toast.dismiss();
      setVerificationId(vId);
      setPendingPhone(sanitizedPhone);
      setOtpCode('');
      setOtpError('');
      setShowOtpModal(true);

      // Returns a Promise so the calling setup component suspends execution
      return new Promise<boolean>((resolve) => {
        setResolvePromise(() => resolve);
      });
    } catch (err: any) {
      toast.dismiss();
      console.error("[AuthContext] OTP dispatch failure:", err);
      toast.error(`OTP dispatch failed: ${err.message || 'Check network connection.'}`);
      return false;
    }
  };

  // Validates user input OTP code with Firebase credentials
  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) {
      setOtpError("OTP strictly 6-digits ka hona chahiye.");
      return;
    }

    setOtpLoading(true);
    setOtpError('');

    try {
      const credential = PhoneAuthProvider.credential(verificationId, otpCode);
      
      // Link Phone number verified identity securely to the active Google user
      await linkWithCredential(auth.currentUser!, credential);

      // If linking completes successfully, lock profile state in Firestore DB
      const userDocRef = doc(db, 'users', user!.uid);
      await updateDoc(userDocRef, {
        phoneNumber: pendingPhone,
        phoneVerified: true,
        isSetupComplete: true,
        updatedAt: serverTimestamp()
      });

      setProfile((prev) => prev ? { 
        ...prev, 
        phoneNumber: pendingPhone, 
        phoneVerified: true, 
        isSetupComplete: true 
      } : null);

      setIsSessionVerified(true);
      setShowOtpModal(false);
      toast.success("Mobile verification completed and locked successfully!");
      
      if (resolvePromise) resolvePromise(true);
    } catch (err: any) {
      console.error("[AuthContext] OTP verification crashed:", err);
      if (err.code === 'auth/credential-already-in-use') {
        setOtpError("Yeh phone number pehle se hi doosre resident account se linked hai!");
      } else if (err.code === 'auth/invalid-verification-code') {
        setOtpError("Galat OTP code entered! Kripya sahi code check kijiye.");
      } else {
        setOtpError(`Verification failed: ${err.message}`);
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleCancelOtp = () => {
    setShowOtpModal(false);
    toast.error("Mobile registration cancelled.");
    if (resolvePromise) resolvePromise(false);
  };

  // Logout triggers
  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      setProfile(null);
      setIsSessionVerified(false);
      toast.success("Logged out successfully.");
    } catch (err) {
      console.error("[AuthContext] Logout failed:", err);
    } finally {
      setLoading(false);
    }
  };
  const signOutUser = logout;

  const isAdmin = profile?.role === 'admin' || user?.email?.toLowerCase() === 'ashwani.sikka@gmail.com';
  const isMasterAdmin = user?.email?.toLowerCase() === 'ashwani.sikka@gmail.com';

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      loginWithGoogle, 
      signInWithGoogle, 
      signIn,            
      login,             
      logout,
      signOutUser,       
      verifyAndBindPhone,
      isDeviceAuthorized,
      isSessionVerified, // Maps back to App.tsx guard checks
      isAdmin,
      isMasterAdmin
    }}>
      {children}

      {/* Dynamic Animated Glassmorphism SMS Verification Modal */}
      {showOtpModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-4 shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-6 15h9m-9 3h9m-9-15h9" />
                </svg>
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Enter OTP</h3>
              <p className="text-slate-500 text-sm mt-1">
                We sent a 6-digit verification code to <span className="font-bold text-indigo-600">+91 {pendingPhone}</span>
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full tracking-[0.5em] text-center text-2xl font-black text-indigo-600 py-3.5 px-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-indigo-500 focus:bg-white focus:outline-none transition-all duration-200"
                  disabled={otpLoading}
                />
                {otpError && (
                  <p className="text-rose-500 text-xs font-bold mt-2 text-center animate-pulse">
                    ⚠️ {otpError}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCancelOtp}
                  disabled={otpLoading}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVerifyOtp}
                  disabled={otpLoading}
                  className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {otpLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "Verify Code"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
