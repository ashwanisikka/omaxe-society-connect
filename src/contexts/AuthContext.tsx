import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
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
  verifyAndBindPhone: (phoneNumber?: any, fullName?: string, gender?: string) => Promise<boolean>;
  isDeviceAuthorized: boolean;
  isSessionVerified: boolean;
  isAdmin: boolean;
  isMasterAdmin: boolean;
  submitMobileResponseKey: (key: string) => Promise<boolean>;
  currentChallengeKey: string | null;
  resetPhoneRegistration: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState(true);
  const [isSessionVerified, setIsSessionVerified] = useState(false);

  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [setupStep, setSetupStep] = useState(1); 
  const [setupName, setSetupName] = useState('');
  const [setupPhone, setSetupPhone] = useState('');
  const [setupGender, setSetupGender] = useState('');
  const [setupSubmitLoading, setSetupSubmitLoading] = useState(false);

  const [showDevToolkit, setShowDevToolkit] = useState(false);

  const setupNameRef = useRef(setupName);
  const setupGenderRef = useRef(setupGender);
  const setupPhoneRef = useRef(setupPhone);

  useEffect(() => { setupNameRef.current = setupName; }, [setupName]);
  useEffect(() => { setupGenderRef.current = setupGender; }, [setupGender]);
  useEffect(() => { setupPhoneRef.current = setupPhone; }, [setupPhone]);

  const [showLaptopHandshake, setShowLaptopHandshake] = useState(false);
  const [laptopHandshakeCode, setLaptopHandshakeCode] = useState('');
  const [mobileChallengeData, setMobileChallengeData] = useState<{
    challengeCode: string;
    choices: string[];
    status: string;
  } | null>(null);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    if (isStandalone) {
      setShowInstallBanner(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] User response to installation choice: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const getDeviceSignature = (): string => {
    let signature = localStorage.getItem('omaxe_device_signature');
    if (!signature) {
      const screenParams = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
      const agentParams = navigator.userAgent.replace(/\D/g, '');
      const uniqueUUID = generateUUID();
      signature = `dev_${btoa(screenParams + agentParams).slice(0, 16)}_${uniqueUUID.slice(0, 8)}`;
      localStorage.setItem('omaxe_device_signature', signature);
    }
    return signature;
  };

  const handleUserLogin = async (currentUser: User) => {
    try {
      console.log("[AuthContext] Syncing profile for user:", currentUser.uid);
      const userDocRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'profile', 'user_data');
      const userDoc = await getDoc(userDocRef);

      const isDesktopClient = window.innerWidth >= 768 && !/Mobi|Android|iPhone/i.test(navigator.userAgent);
      const clientSig = getDeviceSignature();

      if (!userDoc.exists()) {
        const tempProfile: UserProfile = {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || '',
          role: 'user' as UserRole,
          createdAt: new Date().toISOString(),
          phoneVerified: false,
          phoneNumber: '',
          deviceSignature: clientSig,
          isSetupComplete: false
        };
        setProfile(tempProfile);
        setIsSessionVerified(false);
        setIsDeviceAuthorized(true);
        setShowSetupWizard(true);
        setSetupStep(prev => (prev === 2 || prev === 3) ? prev : 1);
        setSetupName(currentUser.displayName || '');
      } else {
        const userData = userDoc.data() as UserProfile;
        setProfile(userData);
        setIsDeviceAuthorized(true);

        if (userData.phoneVerified && userData.isSetupComplete) {
          const authorizedList = userData.authorizedDevices || [];
          const isCurrentSessionAuthorized = userData.deviceSignature === clientSig || authorizedList.includes(clientSig);

          if (isCurrentSessionAuthorized) {
            setIsSessionVerified(true);
            setShowSetupWizard(false);
            setShowLaptopHandshake(false);
            toast.success(`Welcome back, ${userData.displayName || 'Resident'}!`);
          } else {
            if (isDesktopClient) {
              console.log("[AuthContext] Desktop login challenge triggered.");
              setIsSessionVerified(true); 
              setShowSetupWizard(false);
              
              const targetNum = (Math.floor(Math.random() * 90) + 10).toString();
              const decoy1 = (Math.floor(Math.random() * 90) + 10).toString();
              const decoy2 = (Math.floor(Math.random() * 90) + 10).toString();
              const choicesArray = [targetNum, decoy1, decoy2].sort(() => Math.random() - 0.5);
              
              setLaptopHandshakeCode(targetNum);
              setShowLaptopHandshake(true);

              const challengeRef = doc(db, 'artifacts', appId, 'public', 'data', 'challenges', currentUser.uid);
              await setDoc(challengeRef, {
                challengeCode: targetNum,
                choices: choicesArray,
                status: 'pending',
                targetDeviceSig: clientSig,
                createdAt: new Date().toISOString()
              });

              toast.warning("Verification handshake dispatched to your physical mobile phone.");
            } else {
              setIsSessionVerified(true);
              setShowSetupWizard(false);
              setShowLaptopHandshake(false);
            }
          }
        } else {
          setIsSessionVerified(false);
          setShowSetupWizard(true);
          setSetupStep(prev => (prev === 2 || prev === 3) ? prev : 1);
          setSetupName(userData.displayName || currentUser.displayName || '');
          setSetupPhone(userData.phoneNumber || '');
          setSetupGender(userData.gender || '');
        }
      }
    } catch (err: any) {
      console.warn("[AuthContext] Firestore setup failed. Restoring from dynamic cache.", err);
      const localProfileStr = localStorage.getItem(`omaxe_user_profile_${currentUser.uid}`);
      if (localProfileStr) {
        try {
          const localProfile = JSON.parse(localProfileStr) as UserProfile;
          setProfile(localProfile);
          setIsDeviceAuthorized(true);
          setIsSessionVerified(true);
          setShowSetupWizard(false);
        } catch (e) {
          console.error(e);
        }
      } else {
        const fallbackProfile: UserProfile = {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || '',
          role: 'user' as UserRole,
          createdAt: new Date().toISOString(),
          phoneVerified: false,
          phoneNumber: '',
          deviceSignature: 'local_bypass',
          isSetupComplete: false
        };
        setProfile(fallbackProfile);
        setIsDeviceAuthorized(true);
        setIsSessionVerified(false);
        setShowSetupWizard(true);
        setSetupStep(prev => (prev === 2 || prev === 3) ? prev : 1);
        setSetupName(currentUser.displayName || '');
      }
    }
  };

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence)
      .then(() => console.log("[AuthContext] Session persistence initialized."))
      .catch((err) => console.warn("[AuthContext] Persistence failed:", err));

    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          setUser(result.user);
          await handleUserLogin(result.user);
        }
      })
      .catch((err) => console.warn("[AuthContext] Redirect checked:", err.message));

    const handleUrlActivation = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const verifySimUid = urlParams.get('verify_sim');

      if (verifySimUid) {
        try {
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('verify_sim');
          window.history.replaceState({}, document.title, cleanUrl.toString());

          console.log("[AuthContext] Activating verification SIM state for UID:", verifySimUid);
          const verificationRef = doc(db, 'artifacts', appId, 'public', 'data', 'verifications', verifySimUid);
          await setDoc(verificationRef, { status: 'verified' }, { merge: true });
          toast.success("Identity profile verified successfully via SIM Handshake Link.");
        } catch (e: any) {
          console.error("[AuthContext] Link confirmation process failed:", e.message);
        }
      }
    };

    handleUrlActivation();
  }, [appId]);

  useEffect(() => {
    let unsubChallenge: () => void = () => {};
    let unsubVerification: () => void = () => {};
    let unsubProfileDeleteWatcher: () => void = () => {};

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser);
          await handleUserLogin(currentUser);

          const clientSig = getDeviceSignature();
          const challengeRef = doc(db, 'artifacts', appId, 'public', 'data', 'challenges', currentUser.uid);
          const verificationRef = doc(db, 'artifacts', appId, 'public', 'data', 'verifications', currentUser.uid);
          const userDocRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'profile', 'user_data');
          
          unsubProfileDeleteWatcher = onSnapshot(userDocRef, async (profileSnap) => {
            if (!profileSnap.exists()) {
              const hasLocalProfile = localStorage.getItem(`omaxe_user_profile_${currentUser.uid}`);
              if (hasLocalProfile) {
                console.log("[AuthContext] User profile document missing in Firestore. Logging out...");
                localStorage.removeItem(`omaxe_user_profile_${currentUser.uid}`);
                await signOut(auth);
                setUser(null);
                setProfile(null);
                setIsSessionVerified(false);
                setShowSetupWizard(false);
                setShowLaptopHandshake(false);
                toast.error("Your resident profile has been deleted by the Admin. Please register again from scratch.");
              }
            } else {
              setProfile(profileSnap.data() as UserProfile);
            }
          }, (err) => {
            console.warn("[AuthContext] Real-time profile sync restricted:", err.message);
          });

          unsubChallenge = onSnapshot(challengeRef, async (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              
              if (data.targetDeviceSig === clientSig) {
                if (data.status === 'approved') {
                  console.log("[AuthContext] Matching handshake approved. Authorized device unlocked.");
                  const userDoc = await getDoc(userDocRef);
                  if (userDoc.exists()) {
                    const profileData = userDoc.data();
                    const existingAuthorized = profileData.authorizedDevices || [];
                    
                    await updateDoc(userDocRef, {
                      authorizedDevices: [...existingAuthorized, clientSig]
                    });
                  }
                  
                  setIsSessionVerified(true);
                  setShowLaptopHandshake(false);
                  toast.success("Identity handshake matched! Laptop authorized.");
                } else if (data.status === 'rejected') {
                  toast.error("Laptop sign-in rejected on primary device.");
                  setShowLaptopHandshake(false);
                  signOut(auth);
                }
              }

              if (data.status === 'pending' && data.targetDeviceSig !== clientSig) {
                setMobileChallengeData({
                  challengeCode: data.challengeCode,
                  choices: data.choices || [],
                  status: data.status
                });
              } else {
                setMobileChallengeData(null);
              }
            } else {
              setMobileChallengeData(null);
            }
          }, (err) => {
            console.warn("[AuthContext] Handshake challenge listener rules restrict:", err.message);
          });

          unsubVerification = onSnapshot(verificationRef, async (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              if (data.status === 'verified') {
                console.log("[AuthContext] SMS confirmation triggered! Saving final bound profile.");
                
                const updatedProfile: UserProfile = {
                  uid: currentUser.uid,
                  email: currentUser.email || '',
                  displayName: setupNameRef.current.trim() || currentUser.displayName || 'Resident',
                  gender: setupGenderRef.current || 'Not Specified',
                  role: profile?.role || 'user' as UserRole,
                  createdAt: profile?.createdAt || new Date().toISOString(),
                  phoneVerified: true,
                  phoneNumber: data.phone || setupPhoneRef.current,
                  deviceSignature: clientSig,
                  isSetupComplete: true,
                  authorizedDevices: [clientSig]
                };

                localStorage.setItem(`omaxe_user_profile_${currentUser.uid}`, JSON.stringify(updatedProfile));
                await setDoc(userDocRef, updatedProfile, { merge: true });

                setProfile(updatedProfile);
                setIsSessionVerified(true);
                setShowSetupWizard(false);
                toast.success("SIM Ownership validation confirmed! Welcome to Dashboard.");
              }
            }
          });

          return () => {
            unsubProfileDeleteWatcher();
            unsubChallenge();
            unsubVerification();
          };
        } else {
          setUser(null);
          setProfile(null);
          setIsSessionVerified(false);
          setIsDeviceAuthorized(true);
          setShowSetupWizard(false);
          setShowLaptopHandshake(false);
          setMobileChallengeData(null);
        }
      } catch (err) {
        console.error("[AuthContext] Session synchronization failed:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [appId]);

  const executeGoogleAuth = (e?: any) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    setLoading(true);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    signInWithPopup(auth, provider)
      .then(async (result) => {
        setUser(result.user);
        await handleUserLogin(result.user);
      })
      .catch((popupErr: any) => {
        console.warn("[AuthContext] Redirect checked popup fallback...", popupErr.code);
        if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/cancelled-popup-request') {
          signInWithRedirect(auth, provider).catch(() => setLoading(false));
        } else {
          toast.error("Google authentication failed. Please try again.");
          setLoading(false);
        }
      });
  };

  const loginWithGoogle = executeGoogleAuth;
  const signInWithGoogle = executeGoogleAuth;
  const signIn = executeGoogleAuth;
  const login = executeGoogleAuth;

  const initiateSimLoopbackHandshake = async () => {
    if (!user) return;
    const finalPhone = setupPhone.trim().replace(/\D/g, '');
    if (finalPhone.length !== 10 || !/^[6-9]/.test(finalPhone)) {
      toast.error("Error: Kripya ek valid 10-digit mobile number enter kijiye!");
      return;
    }

    setSetupSubmitLoading(true);

    try {
      const verificationRef = doc(db, 'artifacts', appId, 'public', 'data', 'verifications', user.uid);
      await setDoc(verificationRef, {
        phone: finalPhone,
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      const activationUrl = `${window.location.origin}/?verify_sim=${user.uid}`;
      const message = `Activate Omaxe Heights account: ${activationUrl}`;
      const smsUri = `sms:+91${finalPhone}?body=${encodeURIComponent(message)}`;
      
      window.location.href = smsUri;

      setSetupStep(3);
      toast.success("SMS App khul gaya hai, bas Send button dabaiye!");
    } catch (e: any) {
      toast.error(`SIM configuration error: ${e.message}`);
    } finally {
      setSetupStep(3); 
      setSetupSubmitLoading(false);
    }
  };

  const verifyAndBindPhone = async (): Promise<{ safe: boolean }> => {
    return { safe: true } as any; 
  };

  const handleMobileVerificationTap = async (selectedCode: string) => {
    if (!user || !mobileChallengeData) return;
    try {
      const challengeRef = doc(db, 'artifacts', appId, 'public', 'data', 'challenges', user.uid);
      
      if (selectedCode === mobileChallengeData.challengeCode) {
        toast.success("Matching digit confirmed! Unlocking Laptop screen...");
        await updateDoc(challengeRef, { status: 'approved' });
      } else {
        toast.error("Incorrect matching code selected! Security block active.");
        await updateDoc(challengeRef, { status: 'rejected' });
      }
    } catch (e: any) {
      console.error("[AuthContext] Handshake action transmit failed:", e.message);
    }
  };

  const resetPhoneRegistration = async () => {
    if (!user) return;
    localStorage.removeItem(`omaxe_user_profile_${user.uid}`);
    try {
      const userDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'user_data');
      await setDoc(userDocRef, { isSetupComplete: false, phoneVerified: false }, { merge: true });
    } catch (e) {
      console.warn(e);
    }
    setIsSessionVerified(false);
    setShowSetupWizard(true);
    setSetupStep(1);
  };

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      setProfile(null);
      setIsSessionVerified(false);
      setShowSetupWizard(false);
      setShowLaptopHandshake(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  const signOutUser = logout;

  const devResetProfileInDatabase = async () => {
    if (!user) {
      toast.error("Please login with a Google account first to reset it!");
      return;
    }
    setLoading(true);
    try {
      const userDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'user_data');
      await setDoc(userDocRef, {
        isSetupComplete: false,
        phoneVerified: false,
        phoneNumber: "",
        displayName: ""
      }, { merge: true });

      const challengeRef = doc(db, 'artifacts', appId, 'public', 'data', 'challenges', user.uid);
      await setDoc(challengeRef, { status: 'inactive' }, { merge: true });
    } catch (err: any) {
      console.warn("[DevToolkit] Firestore cleanup skipped/blocked by permission rules:", err.message);
    } finally {
      localStorage.removeItem(`omaxe_user_profile_${user.uid}`);
      setProfile(null);
      setIsSessionVerified(false);
      setShowSetupWizard(true);
      setSetupStep(1);
      setSetupName('');
      setSetupPhone('');
      setSetupGender('');
      toast.success("Reset Complete! Open registration active once again.");
      setLoading(false);
    }
  };

  const devWipeDeviceSignature = () => {
    localStorage.removeItem('omaxe_device_signature');
    toast.success("Device browser signature wiped! Laptop treated as unrecognized.");
    window.location.reload();
  };

  const devSimulateAdminDeletion = async () => {
    if (!user) {
      toast.error("No active user to simulate admin deletion!");
      return;
    }
    try {
      const userDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'user_data');
      await setDoc(userDocRef, { isSetupComplete: false, phoneVerified: false }, { merge: true });
    } catch (err: any) {
      console.warn("[DevToolkit] Firestore simulate skip permissions:", err.message);
    } finally {
      localStorage.removeItem(`omaxe_user_profile_${user.uid}`);
      setProfile(null);
      setIsSessionVerified(false);
      setShowSetupWizard(true);
      setSetupStep(1);
      toast.success("Admin deletion simulated! Session states wiped out completely.");
    }
  };

  const submitMobileResponseKey = async () => true;
  const currentChallengeKey = null;

  const lastTwoDigitsOfPhone = profile?.phoneNumber ? profile.phoneNumber.slice(-2) : 'XX';

  const isDesktop = window.innerWidth >= 768 && !/Mobi|Android|iPhone/i.test(navigator.userAgent);
  const isMasterAdmin = user?.email?.toLowerCase() === 'ashwani.sikka@gmail.com';
  const isAdmin = profile?.role === 'admin' || isMasterAdmin;

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
      isSessionVerified,
      isAdmin,
      isMasterAdmin,
      submitMobileResponseKey,
      currentChallengeKey,
      resetPhoneRegistration
    }}>
      {children}

      {showInstallBanner && (
        <div className="fixed top-4 left-4 right-4 z-[2000000] flex items-center justify-between bg-slate-900 text-white p-4 rounded-[1.8rem] shadow-2xl border-2 border-indigo-500/30 animate-in slide-in-from-top-10 duration-300">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📲</span>
            <div className="text-left">
              <p className="text-xs font-black uppercase tracking-wider text-indigo-400">Install Omaxe Heights App</p>
              <p className="text-[10px] text-slate-300 font-semibold leading-tight">Install this web app to your home screen for rapid free 2FA & direct access.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={handleInstallApp}
              className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-[10px] font-black uppercase tracking-wider px-4 py-2 rounded-xl transition-all"
            >
              Install App
            </button>
            <button
              onClick={() => setShowInstallBanner(false)}
              className="text-slate-400 hover:text-white p-1 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {isMasterAdmin && (
        <div className="fixed bottom-6 right-6 z-[999999] flex flex-col items-end">
          {!showDevToolkit ? (
            <button
              onClick={() => setShowDevToolkit(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-5 py-3.5 rounded-full shadow-2xl border-2 border-white flex items-center gap-2 transition duration-200"
            >
              ⚙️ DEVELOPER TEST TOOLKIT
            </button>
          ) : (
            <div className="w-80 bg-slate-900 border-2 border-indigo-500 text-white rounded-[2rem] p-5 shadow-2xl flex flex-col animate-in slide-in-from-bottom-5 duration-200">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-black text-indigo-400 tracking-wider uppercase">
                  🛡️ Developer Test Toolkit
                </span>
                <button
                  onClick={() => setShowDevToolkit(false)}
                  className="text-slate-400 hover:text-white text-sm font-bold"
                >
                  ✕ Close
                </button>
              </div>

              <p className="text-[11px] text-slate-400 font-semibold mb-4 leading-relaxed">
                Use this panel on mobile or laptop to force-reset any Google account state or device identification on-the-spot!
              </p>

              <div className="space-y-2.5">
                <button
                  onClick={devResetProfileInDatabase}
                  className="w-full text-left py-2.5 px-4 bg-indigo-950/50 hover:bg-indigo-950 text-indigo-300 hover:text-indigo-200 text-xs font-black rounded-2xl border border-indigo-800/40 transition duration-150 flex items-center justify-between"
                >
                  <span>🔥 Reset Active User & Setup</span>
                  <span className="text-[10px] bg-indigo-900 text-indigo-300 py-0.5 px-2 rounded-full font-bold">Wizard</span>
                </button>

                <button
                  onClick={devWipeDeviceSignature}
                  className="w-full text-left py-2.5 px-4 bg-indigo-950/50 hover:bg-indigo-950 text-indigo-300 hover:text-indigo-200 text-xs font-black rounded-2xl border border-indigo-800/40 transition duration-150 flex items-center justify-between"
                >
                  <span>💻 Wipe My Device Signature</span>
                  <span className="text-[10px] bg-indigo-900 text-indigo-300 py-0.5 px-2 rounded-full font-bold">2FA Laptop</span>
                </button>

                <button
                  onClick={devSimulateAdminDeletion}
                  className="w-full text-left py-2.5 px-4 bg-rose-950/50 hover:bg-rose-950 text-rose-300 hover:text-rose-200 text-xs font-black rounded-2xl border border-rose-800/40 transition duration-150 flex items-center justify-between"
                >
                  <span>🚨 Simulate Admin Profile Delete</span>
                  <span className="text-[10px] bg-rose-900 text-rose-300 py-0.5 px-2 rounded-full font-bold">Logout</span>
                </button>
              </div>

              <div className="h-px bg-slate-800 my-4"></div>

              <div className="text-[10px] text-slate-500 font-bold flex flex-col gap-0.5 leading-normal">
                <p>• Active User Email: <span className="text-slate-300 font-extrabold">{user?.email || 'Logged Out'}</span></p>
                <p>• Device Signature ID: <span className="text-slate-300 font-mono text-[9px]">{getDeviceSignature()}</span></p>
                <p>• Setup Complete: <span className="text-slate-300 font-extrabold">{profile?.isSetupComplete ? 'YES' : 'NO'}</span></p>
              </div>
            </div>
          )}
        </div>
      )}

      {showSetupWizard && user && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100 flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center mb-6">
              <span className="text-xs font-black text-indigo-600 tracking-test uppercase mb-2">
                Identity Activation
              </span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
                Resident Registration
              </h2>
              <div className="h-1 w-16 bg-indigo-600 rounded-full mt-3"></div>
            </div>

            {isDesktop ? (
              <div className="space-y-6 text-center">
                <div className="w-20 h-20 bg-indigo-50 rounded-[2.2rem] flex items-center justify-center text-indigo-600 mx-auto mb-2 shadow-inner">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10 animate-pulse">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-6 15h9m-9 3h9m-9-15h9" />
                  </svg>
                </div>

                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Mobile SIM Proof Required</h3>
                <p className="text-slate-500 text-sm leading-relaxed px-2">
                  Resident registration laptop/desktop par allow nahi hai. Is identity validation process ke liye aapka mobile SIM card physical device mein active hona anivarya hai.
                </p>

                <div className="bg-slate-50 border-2 border-indigo-50/50 rounded-[2rem] p-6 text-left space-y-4">
                  <p className="text-xs font-black text-indigo-600 uppercase tracking-wider flex items-center gap-2">
                    🛡️ How to activate:
                  </p>
                  <ul className="text-xs text-slate-500 font-semibold space-y-2.5 leading-relaxed">
                    <li className="flex gap-2">
                      <span className="text-indigo-600 font-bold">1.</span>
                      <span>Apne mobile phone browser mein <strong>omaxe-society-connect.vercel.app</strong> open kijiye.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-indigo-600 font-bold">2.</span>
                      <span>Same Google account (<span className="text-slate-700 font-black">{user.email}</span>) se login kijiye.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-indigo-600 font-bold">3.</span>
                      <span>Apna Mobile Number dalkar <strong>SMS Handshake Verify</strong> kijiye.</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-4 space-y-4">
                  <div className="flex items-center justify-center gap-2 text-indigo-600 font-extrabold text-xs">
                    <svg className="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Awaiting mobile SIM activation...</span>
                  </div>

                  <button
                    type="button"
                    onClick={logout}
                    className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition duration-150 text-xs uppercase tracking-widest"
                  >
                    Cancel & Sign Out
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {setupStep === 1 && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-black text-slate-500 tracking-wider uppercase mb-2">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={setupName}
                        onChange={(e) => setSetupName(e.target.value)}
                        placeholder="Enter your full name"
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 focus:bg-white focus:outline-none transition-all duration-200 text-slate-800 font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black text-slate-500 tracking-wider uppercase mb-2">
                        Select Gender
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setSetupGender('Male')}
                          className={`py-3 px-4 rounded-2xl border-2 font-black transition-all duration-150 text-sm ${
                            setupGender === 'Male'
                              ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                              : 'border-slate-100 bg-slate-50/50 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          Male
                        </button>
                        <button
                          type="button"
                          onClick={() => setSetupGender('Female')}
                          className={`py-3 px-4 rounded-2xl border-2 font-black transition-all duration-150 text-sm ${
                            setupGender === 'Female'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                          : 'border-slate-100 bg-slate-50/50 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          Female
                        </button>
                      </div>
                    </div>

                    <div className="pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          if (!setupName.trim()) {
                            toast.error("Kripya apna Full Name enter kijiye!");
                            return;
                          }
                          if (!setupGender) {
                            toast.error("Kripya Gender select kijiye!");
                            return;
                          }
                          setSetupStep(2);
                        }}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-black rounded-2xl shadow-lg shadow-indigo-600/20 transition-all duration-150 text-center uppercase tracking-wider text-xs"
                      >
                        Proceed to SIM Validation
                      </button>
                    </div>
                  </div>
                )}

                {setupStep === 2 && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-black text-slate-500 tracking-wider uppercase mb-2">
                        10-Digit Mobile Number
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">
                          +91
                        </span>
                        <input
                          type="tel"
                          maxLength={10}
                          value={setupPhone}
                          onChange={(e) => setSetupPhone(e.target.value.replace(/\D/g, ''))}
                          placeholder="Enter mobile number"
                          className="w-full pl-14 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-indigo-500 focus:bg-white focus:outline-none transition-all duration-200 text-slate-800 font-black tracking-widest text-lg"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold mt-2.5 uppercase tracking-wide leading-relaxed">
                        ⚠️ SIM Proof Required: Yeh number aapke isi mobile phone ke physical SIM card slot mein active hona chahiye.
                      </p>
                    </div>

                    <div className="pt-4 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSetupStep(1)}
                        className="py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-2xl transition duration-150 text-center text-xs uppercase"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={initiateSimLoopbackHandshake}
                        disabled={setupSubmitLoading}
                        className="py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-lg shadow-indigo-600/20 transition duration-150 text-center text-xs uppercase"
                      >
                        Verify SIM card 🛡️
                      </button>
                    </div>
                  </div>
                )}

                {setupStep === 3 && (
                  <div className="space-y-6 text-center">
                    <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mx-auto mb-2 animate-bounce">
                      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3h9m-9 3h3m-6.75 4.5h16.5a2.25 2.25 0 0 0 2.25-2.25V5.25A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25v13.5A2.25 2.25 0 0 0 5.25 21Z" />
                      </svg>
                    </div>

                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Carrier SMS Loopback Dispatched</h3>
                    
                    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 text-left space-y-4">
                      <div className="flex gap-3">
                        <span className="text-lg">📱</span>
                        <div>
                          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">SMS Dispatch Target</p>
                          <p className="text-base font-black text-slate-800 tracking-wider mt-0.5">+91 {setupPhone}</p>
                        </div>
                      </div>
                      
                      <div className="h-px bg-slate-200"></div>
                      
                      <div className="text-xs text-slate-500 font-bold leading-relaxed space-y-2">
                        <p>1. Apne mobile messaging app par pre-filled verification SMS ko send kijiye.</p>
                        <p>2. SMS send hote hi wo automatically is mobile par receive ho jayega.</p>
                        <p className="text-indigo-600 font-extrabold">3. Inbox mein aaye activation link par click kijiye, aapka and laptop ka login session instantly unlock ho jayenge!</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 pt-2">
                      <div className="flex items-center justify-center gap-2 text-indigo-600 font-extrabold text-xs">
                        <svg className="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824
