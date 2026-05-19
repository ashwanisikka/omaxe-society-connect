import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously, 
  signOut, 
  User,
  Auth
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Environment variables ko access karne ke liye window object ka use kar rahe hain
// taaki build environment mein 'import.meta' ke warnings na aayein.
const env = (window as any)._env_ || {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || import.meta.env?.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || import.meta.env?.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID || import.meta.env?.VITE_FIREBASE_APP_ID
};

// Singleton initialization
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (error) {
  console.error("Firebase initialization error:", error);
}

// Context definition
interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: Error | null;
  logout: () => Promise<void>;
  authInstance: Auth;
  dbInstance: Firestore;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Auth state observer
    const unsubscribe = onAuthStateChanged(
      auth, 
      (currentUser) => {
        if (currentUser) {
          setUser(currentUser);
          setLoading(false);
        } else {
          // Automatic Anonymous Sign-in logic
          signInAnonymously(auth)
            .then(() => {
              // Sign in ho gaya, listener update ho jayega
            })
            .catch((err) => {
              console.error("Anonymous sign-in failed:", err);
              setError(err as Error);
              setLoading(false);
            });
        }
      },
      (err) => {
        console.error("Auth state change error:", err);
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
      throw err;
    }
  };

  const value = {
    user,
    loading,
    error,
    logout,
    authInstance: auth,
    dbInstance: db
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

// Custom hook for easier access
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export { auth, db };
