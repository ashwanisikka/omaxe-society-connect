import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signOut,
  setPersistence,
  browserLocalPersistence,
  User
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: (e?: any) => void;
  signInWithGoogle: (e?: any) => void;
  signIn: (e?: any) => void;
  login: (e?: any) => void;
  logout: () => Promise<void>;
  signOutUser: () => Promise<void>;
  verifyAndBindPhone: (phoneNumber: string) => Promise<boolean>;
  isDeviceAuthorized: boolean;
  isSessionVerified: boolean;
  isAdmin: boolean;
  isMasterAdmin: boolean;
  submitMobileResponseKey: (key: string) => Promise<boolean>;
  currentChallengeKey: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Device verification states
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState(false);
  const [isSessionVerified, setIsSessionVerified] = useState(false);
  
  // Shadow Mode Handshake UI states
  const [showShadowModeScreen, setShowShadowModeScreen] = useState(false);
  const [responseKeyInput, setResponseKeyInput] = useState('');
  const [mobileChallengeKey, setMobileChallengeKey] = useState<string | null>(null);
  const [shadowModeError, setShadowModeError] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  // Helper: Generates local client browser identifier
  const getDeviceSignature = (): string => {
    let signature = localStorage.getItem('omaxe_device_signature');
    if (!signature) {
      const screenParams = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
      const agentParams = navigator.userAgent.replace(/\D/g, '');
      const uniqueUUID = crypto.randomUUID();
      signature = `dev_${btoa(screenParams + agentParams).slice(0, 16)}_${uniqueUUID.slice(0, 8)}`;
      localStorage.setItem('omaxe_device_signature', signature);
    }
    return signature;
  };

  // Profile database initialization & synchronization handler
  const handleUserLogin = async (currentUser: User) => {
    try {
      console.log("[AuthContext] Aligning profile details for:", currentUser.uid);
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      const clientSig = getDeviceSignature();

      if (!userDoc.exists()) {
        console.log("[AuthContext] Profile missing. Creating standard resident template...");
        const newProfile: UserProfile = {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || 'Resident',
          role: 'user' as UserRole,
          createdAt: new Date().toISOString(),
          phoneVerified: false,
          phoneNumber: '',
          deviceSignature: clientSig, // Primary registration device browser
          isSetupComplete: false
        };
        await setDoc(userDocRef, newProfile);
        setProfile(newProfile);
        setIsDeviceAuthorized(true);
        setIsSessionVerified(false);
        toast.success("Google authenticated! Please set up your 10-digit primary mobile.");
      } else {
        const userData = userDoc.data() as UserProfile;
        setProfile(userData);

        // Security check: is this browser session already authenticated?
        const isRegisteredDevice = userData.deviceSignature === clientSig || (userData.authorizedDevices && userData.authorizedDevices.includes(clientSig));

        if (isRegisteredDevice) {
          // Trusted primary device: bypass all cross-device security screens instantly
          setIsDeviceAuthorized(true);
          setShowShadowModeScreen(false);
          if (userData.phoneVerified && userData.isSetupComplete) {
            setIsSessionVerified(true);
            toast.success(`Welcome back, ${userData.displayName || 'Resident'}!`);
          } else {
            setIsSessionVerified(false);
          }
        } else {
          // NEW CROSS-DEVICE SIGN-IN ATTEMPT DETECTED (e.g. LAPTOP)
          if (userData.phoneVerified && userData.isSetupComplete) {
            console.log("[AuthContext] Unauthorized laptop browser. Forcing secure 'Shadow Mode'...");
            setIsDeviceAuthorized(false);
            setIsSessionVerified(false);
            
            // Generate a secure 4-digit challenge code ONLY if there isn't an active one already
            const hasExistingChallenge = userData.pendingChallenge && 
              userData.pendingChallenge.targetDeviceSig === clientSig &&
              userData.pendingChallenge.status === "pending";

            if (!hasExistingChallenge) {
              const secureCode = (Math.floor(Math.random() * 9000) + 1000).toString();
              await updateDoc(userDocRef, {
                pendingChallenge: {
                  challengeCode: secureCode,
                  targetDeviceSig: clientSig,
                  status: "pending",
                  createdAt: new Date().toISOString()
                }
              });
            }

            setShowShadowModeScreen(true);
            toast.warning("Cross-Device security verification active. Confirm on your phone!");
          } else {
            // First time registration: no primary device locked yet
            setIsDeviceAuthorized(true);
            setIsSessionVerified(false);
          }
        }
      }
    } catch (err: any) {
      console.error("[AuthContext] Profile sync crashed safely:", err);
    }
  };

  useEffect(() => {
    // A. Set persistent session config to local storage to prevent session clearing on laptop
    setPersistence(auth, browserLocalPersistence)
      .then(() => console.log("[AuthContext] persistence successfully initialized."))
      .catch((err) => console.error("[AuthContext] Persistence registration failed:", err));

    // B. Recover redirected Google login states
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          setUser(result.user);
          await handleUserLogin(result.user);
        }
      })
      .catch((err) => console.warn("[AuthContext] Redirect checked:", err.message));

    // C. Active persistent authentication session watcher
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser);
          await handleUserLogin(currentUser);

          // Real-time Firestore document observer to sync Laptop and Phone states instantly
          const userDocRef = doc(db, 'users', currentUser.uid);
          const unsubProfile = onSnapshot(userDocRef, (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              setProfile(data as UserProfile);
              const clientSig = getDeviceSignature();

              // MONITOR A: Laptop View (Awaiting verification from primary phone)
              if (data.pendingChallenge && data.pendingChallenge.targetDeviceSig === clientSig) {
                if (data.pendingChallenge.status === "pending") {
                  setShowShadowModeScreen(true); // Maintain shadow mode overlay on refresh
                } else if (data.pendingChallenge.status === "approved") {
                  console.log("[AuthContext] Cross-device challenge approved! Laptop authorized.");
                  
                  // Save this laptop browser session signature as verified device
                  const existingAuthorized = data.authorizedDevices || [];
                  updateDoc(userDocRef, {
                    authorizedDevices: [...existingAuthorized, clientSig],
                    pendingChallenge: null
                  }).then(() => {
                    setIsDeviceAuthorized(true);
                    setIsSessionVerified(true);
                    setShowShadowModeScreen(false);
                    toast.success("Security verified! Laptop session successfully unlocked.");
                  });
                } else if (data.pendingChallenge.status === "rejected") {
                  setShadowModeError("Access request was denied by your primary phone.");
                  setShowShadowModeScreen(false);
                  signOut(auth);
                }
              }

              // MONITOR B: Primary Mobile Phone View (Displays authorization prompt with key)
              if (data.pendingChallenge && data.deviceSignature === clientSig && data.pendingChallenge.targetDeviceSig !== clientSig) {
                if (data.pendingChallenge.status === "pending") {
                  // Show the secure 4-digit hardware response key on the phone screen!
                  setMobileChallengeKey(data.pendingChallenge.challengeCode);
                } else {
                  setMobileChallengeKey(null);
                }
              } else {
                setMobileChallengeKey(null);
              }
            }
          });

          return () => unsubProfile();
        } else {
          setUser(null);
          setProfile(null);
          setIsDeviceAuthorized(false);
          setIsSessionVerified(false);
          setShowShadowModeScreen(false);
          setMobileChallengeKey(null);
        }
      } catch (err) {
        console.error("[AuthContext] Handshake state failed:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Secure standard Google Popup trigger (Direct synchronous gesture - prevents popup blocker)
  const executeGoogleAuth = (e?: any) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    console.log("[AuthContext] Invoking secure Google sign-in window with direct click gesture...");
    
    // Immediate popup initialization bypasses Chrome popup blockers entirely
    signInWithPopup(auth, provider)
      .then(async (result) => {
        setLoading(true);
        setUser(result.user);
        await handleUserLogin(result.user);
      })
      .catch((popupErr: any) => {
        console.error("[AuthContext] Popup triggered redirect fallback:", popupErr.code);
        setLoading(false);
        if (popupErr.code === 'auth/popup-blocked') {
          toast.error("Popup window blocked! Please allow popups for this site in your address bar icon, then click login.");
        } else {
          toast.error(`Google login failed: ${popupErr.message}`);
        }
      });
  };

  const loginWithGoogle = executeGoogleAuth;
  const signInWithGoogle = executeGoogleAuth;
  const signIn = executeGoogleAuth;
  const login = executeGoogleAuth;

  // Locks validated 10-digit primary mobile phone
  const verifyAndBindPhone = async (phoneNumber: string): Promise<boolean> => {
    if (!user) {
      toast.error("Google session invalid. Please log in using Google first.");
      return false;
    }

    const sanitizedPhone = phoneNumber.trim().replace(/\D/g, '');

    // Strict validation rules
    if (sanitizedPhone.length !== 10) {
      toast.error("Error: Kripya ek valid 10-digit mobile number enter kijiye!");
      return false;
    }
    if (!/^[6-9]/.test(sanitizedPhone)) {
      toast.error("Error: Indian mobile numbers strictly 6, 7, 8, ya 9 se start hote hain!");
      return false;
    }
    if (/^(\d)\1{9}$/.test(sanitizedPhone)) {
      toast.error("Error: Repetitive sequential fake numbers allow nahi hain!");
      return false;
    }

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const clientSig = getDeviceSignature();

      await updateDoc(userDocRef, {
        phoneNumber: sanitizedPhone,
        phoneVerified: true,
        deviceSignature: clientSig, // Lock current browser as the primary verification phone
        isSetupComplete: true,
        updatedAt: serverTimestamp()
      });

      setProfile((prev) => prev ? { 
        ...prev, 
        phoneNumber: sanitizedPhone, 
        phoneVerified: true, 
        deviceSignature: clientSig,
        isSetupComplete: true 
      } : null);

      setIsDeviceAuthorized(true);
      setIsSessionVerified(true);
      toast.success("Mobile linked successfully as primary verification device!");
      return true;
    } catch (err: any) {
      console.error("[AuthContext] Setup failed:", err);
      toast.error(`Database Error: ${err.message || 'Verification blocked'}`);
      return false;
    }
  };

  // Validates laptop entered challenge response key against Firestore target code
  const submitMobileResponseKey = async (key: string): Promise<boolean> => {
    if (!user || !profile || !profile.pendingChallenge) return false;

    setSubmitLoading(true);
    setShadowModeError('');

    try {
      const targetCode = profile.pendingChallenge.challengeCode;
      if (key.trim() === targetCode) {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, {
          "pendingChallenge.status": "approved"
        });
        setSubmitLoading(false);
        return true;
      } else {
        setShadowModeError("Galat security response key enter kiya gaya hai. Sahi key enter kijiye!");
        setSubmitLoading(false);
        return false;
      }
    } catch (err: any) {
      setShadowModeError(`Verification error: ${err.message}`);
      setSubmitLoading(false);
      return false;
    }
  };

  // Reject/Cancel current challenge request
  const cancelChallengeRequest = async () => {
    if (!user) return;
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        pendingChallenge: null
      });
      setShowShadowModeScreen(false);
      signOut(auth);
    } catch (err) {
      console.error(err);
    }
  };

  // Logout triggers
  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      setProfile(null);
      setIsSessionVerified(false);
      setIsDeviceAuthorized(false);
      setShowShadowModeScreen(false);
    } catch (err) {
      console.error("[AuthContext] Logout failed:", err);
    } finally {
      setLoading(false);
    }
  };
  const signOutUser = logout;

  const isAdmin = profile?.role === 'admin' || user?.email?.toLowerCase() === 'ashwani.sikka@gmail.com';
  const isMasterAdmin = user?.email?.toLowerCase() === 'ashwani.sikka@gmail.com';

  const lastTwoDigitsOfPhone = profile?.phoneNumber ? profile.phoneNumber.slice(-2) : 'XX';

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
      isSessionVerified, // Maps directly back to App.tsx router verification checks
      isAdmin,
      isMasterAdmin,
      submitMobileResponseKey,
      currentChallengeKey: mobileChallengeKey
    }}>
      {children}

      {/* LAPTOP SCREEN OVERLAY: Google-Style Shadow Mode 2FA Verification */}
      {showShadowModeScreen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md">
          <div className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center mb-6">
              <span className="text-xs font-black text-indigo-600 tracking-widest uppercase mb-2">
                Identity Activation
              </span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
                Mandatory Safety Registration
              </h2>
              <div className="h-1 w-16 bg-indigo-600 rounded-full mt-3"></div>
            </div>

            <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-2xl py-2.5 px-6 mb-6">
              <span className="text-xs font-bold text-indigo-600 tracking-wider uppercase">
                Step 4 of 4: Security Code
              </span>
            </div>

            <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 mb-4 animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-6 15h9m-9 3h9m-9-15h9" />
              </svg>
            </div>

            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Cross-Device Auth Required
            </h3>
            <p className="text-slate-500 text-sm mt-1">
              Check your mobile ending in <span className="font-extrabold text-indigo-600">...{lastTwoDigitsOfPhone}</span>
            </p>

            <div className="w-full max-w-xs bg-slate-950 text-slate-200 rounded-2xl p-4 my-6 text-xs text-center border border-slate-800">
              <p className="font-bold tracking-wider text-rose-500 uppercase mb-1">
                ⚠️ Code is hidden for security
              </p>
              <p className="text-slate-400">
                Verify via Google prompt on your SIM-linked phone
              </p>
            </div>

            <div className="w-full max-w-xs space-y-4">
              <div className="text-left">
                <label className="block text-xs font-black text-slate-400 tracking-wider uppercase mb-2 text-center">
                  Enter Mobile Response Key
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={responseKeyInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setResponseKeyInput(val);
                    if (val.length === 4) {
                      submitMobileResponseKey(val);
                    }
                  }}
                  placeholder="- - - -"
                  className="w-full tracking-[1.2em] text-center text-3xl font-black text-indigo-600 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-indigo-500 focus:bg-white focus:outline-none transition-all duration-200"
                  disabled={submitLoading}
                />
                {shadowModeError && (
                  <p className="text-rose-500 text-xs font-bold mt-2.5 text-center animate-pulse">
                    {shadowModeError}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={cancelChallengeRequest}
                  disabled={submitLoading}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition duration-150"
                >
                  Cancel Auth
                </button>
              </div>

              <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest pt-4">
                {submitLoading ? "Verifying Token..." : "Waiting for SIM..."}
              </div>

              <p className="text-[11px] text-rose-500/80 font-semibold italic mt-2">
                This desktop is now in 'Shadow Mode'. Identity must be confirmed via mobile hardware.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE SCREEN OVERLAY: Displays the active 4-digit code to authorize the laptop */}
      {mobileChallengeKey && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-lg">
          <div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl p-6 border border-slate-100 flex flex-col items-center text-center animate-in slide-in-from-bottom duration-300">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Laptop Sign-In Prompt</h3>
            <p className="text-slate-500 text-xs px-2 mt-1 mb-6">
              Is that you trying to sign in from another laptop or desktop browser? Your secure mobile response key is:
            </p>
            
            <div className="w-36 py-4 bg-indigo-600 text-white rounded-3xl flex items-center justify-center text-4xl font-black shadow-lg shadow-indigo-600/30 tracking-widest">
              {mobileChallengeKey}
            </div>

            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-6 mb-4 animate-pulse">
              Awaiting laptop response...
            </p>

            <button
              onClick={async () => {
                const userDocRef = doc(db, 'users', user!.uid);
                await updateDoc(userDocRef, {
                  "pendingChallenge.status": "rejected"
                });
              }}
              className="w-full py-3 px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-2xl transition duration-150"
            >
              No, It's Not Me (Block Access)
            </button>
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
