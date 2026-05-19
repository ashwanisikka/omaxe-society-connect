import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
// Import path ko project root ke relative adjust kiya gaya hai
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Auth state change track karna
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Agar user login hai, toh Firestore se profile fetch karna
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const userRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'profile', 'data');
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          setProfile(userSnap.data() as UserProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login mein error aaya:", error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout mein error aaya:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, loginWithGoogle, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
