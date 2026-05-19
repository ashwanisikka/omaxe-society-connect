import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { 
  onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, 
  GoogleAuthProvider, signOut, setPersistence, browserLocalPersistence, 
  User, initializeApp, getAuth, Auth 
} from 'firebase/auth';
import { doc, getDoc, setDoc, getFirestore, Firestore } from 'firebase/firestore';

// --- Configuration ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Factorization Engine for Handshake ---
const getFactorization = (num: number) => {
  const factors: number[] = [];
  for (let i = 1; i <= Math.sqrt(num); i++) {
    if (num % i === 0) {
      factors.push(i);
      if (i !== num / i) factors.push(num / i);
    }
  }
  return factors.sort((a, b) => a - b);
};

// --- Auth Context Definition ---
interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  isDeviceAuthorized: boolean;
  isSessionVerified: boolean;
  showSetupWizard: boolean;
  devToolkit: {
    enabled: boolean;
    logs: string[];
    factorize: (n: number) => number[];
  };
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState(true);
  const [isSessionVerified, setIsSessionVerified] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  
  // Dev Toolkit State
  const [logs, setLogs] = useState<string[]>(['System Ready', 'Initializing Auth Handshake...']);
  
  const appId = "omaxe-society-connect-v1";

  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-10), `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleUserLogin = async (currentUser: User) => {
    addLog('Checking user profile...');
    const userDocRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'profile', 'user_data');
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      addLog('New user detected, launching Setup Wizard.');
      setShowSetupWizard(true);
    } else {
      addLog('Profile found, authorizing session.');
      setProfile(userDoc.data());
      setIsSessionVerified(true);
    }
  };

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence);
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await handleUserLogin(currentUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const value = {
    user,
    profile,
    loading,
    isDeviceAuthorized,
    isSessionVerified,
    showSetupWizard,
    devToolkit: {
      enabled: true,
      logs,
      factorize: getFactorization
    },
    loginWithGoogle: () => {
      const provider = new GoogleAuthProvider();
      signInWithPopup(auth, provider).catch(() => signInWithRedirect(auth, provider));
    },
    logout: async () => await signOut(auth)
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
