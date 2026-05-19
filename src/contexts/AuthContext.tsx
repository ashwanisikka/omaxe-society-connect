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
  User,
  initializeApp,
  getAuth
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, getFirestore } from 'firebase/firestore';

// Initialize Firebase services locally to resolve missing import error
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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
        setSetupStep(1);
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
          } else {
            if (isDesktopClient) {
              setIsSessionVerified(true);
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
            } else {
              setIsSessionVerified(true);
            }
          }
        } else {
          setIsSessionVerified(false);
          setShowSetupWizard(true);
          setSetupStep(2);
        }
      }
    } catch (err: any) {
      console.warn("[AuthContext] Firestore sync error:", err);
    }
  };

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence);
    getRedirectResult(auth).then(async (result) => {
      if (result && result.user) {
        setUser(result.user);
        await handleUserLogin(result.user);
      }
    });

    const verifySimUid = new URLSearchParams(window.location.search).get('verify_sim');
    if (verifySimUid) {
      const verificationRef = doc(db, 'artifacts', appId, 'public', 'data', 'verifications', verifySimUid);
      setDoc(verificationRef, { status: 'verified' }, { merge: true });
    }
  }, [appId]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await handleUserLogin(currentUser);
        setLoading(false);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [appId]);

  const executeGoogleAuth = (e?: any) => {
    if (e) e.preventDefault();
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(() => signInWithRedirect(auth, provider));
  };

  const logout = async () => {
    await signOut(auth);
  };

  const isDesktop = window.innerWidth >= 768 && !/Mobi|Android|iPhone/i.test(navigator.userAgent);
  const isMasterAdmin = user?.email?.toLowerCase() === 'ashwani.sikka@gmail.com';
  const isAdmin = profile?.role === 'admin' || isMasterAdmin;

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      loginWithGoogle: executeGoogleAuth, 
      signInWithGoogle: executeGoogleAuth, 
      signIn: executeGoogleAuth,            
      login: executeGoogleAuth,             
      logout,
      signOutUser: logout,       
      verifyAndBindPhone: async () => true,
      isDeviceAuthorized,
      isSessionVerified,
      isAdmin,
      isMasterAdmin,
      submitMobileResponseKey: async () => true,
      currentChallengeKey: null,
      resetPhoneRegistration: async () => {}
    }}>
      {children}
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
