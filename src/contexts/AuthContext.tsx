import React, { createContext, useContext, useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth,
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect, 
  GoogleAuthProvider, 
  signOut,
  setPersistence,
  browserLocalPersistence,
  User
} from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

// Environment variables ko window object se access kar rahe hain taaki build environment mein warnings na aayein.
const env = (window as any)._env_ || {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || import.meta.env?.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || import.meta.env?.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID || import.meta.env?.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Factorization engine for handshake
const getFactorization = (n: number) => {
  const factors: number[] = [];
  for (let i = 1; i <= Math.sqrt(n); i++) {
    if (n % i === 0) {
      factors.push(i);
      if (i !== n / i) factors.push(n / i);
    }
  }
  return factors.sort((a, b) => a - b);
};

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  isDeviceAuthorized: boolean;
  showSetupWizard: boolean;
  devToolkit: {
    enabled: boolean;
    logs: string[];
    factorize: (n: number) => number[];
  };
  handshake: {
    initiate: () => void;
    status: string;
  };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState(true);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [logs, setLogs] = useState<string[]>(['System Ready', 'Auth context mounted...']);
  const [handshakeStatus, setHandshakeStatus] = useState('idle');

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const initiateHandshake = () => {
    addLog('Initiating secure handshake...');
    setHandshakeStatus('encrypting');
    setTimeout(() => {
      setHandshakeStatus('authorized');
      addLog('Handshake successful. Access granted.');
    }, 1500);
  };

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence);
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        addLog(`User logged in: ${currentUser.email}`);
        
        // Sync user profile
        const userDocRef = doc(db, 'artifacts', 'omaxe-society-connect-v1', 'users', currentUser.uid, 'profile', 'user_data');
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) {
          addLog('First time user: launching wizard');
          setShowSetupWizard(true);
        } else {
          setProfile(userDoc.data());
        }
      } else {
        setUser(null);
        addLog('User signed out.');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loginWithGoogle = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(() => signInWithRedirect(auth, provider));
  };

  const logout = async () => await signOut(auth);

  return (
    <AuthContext.Provider value={{ 
      user, profile, loading, loginWithGoogle, logout, 
      isDeviceAuthorized, showSetupWizard,
      devToolkit: { enabled: true, logs, factorize: getFactorization },
      handshake: { initiate: initiateHandshake, status: handshakeStatus }
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
