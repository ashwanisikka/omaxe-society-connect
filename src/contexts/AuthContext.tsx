import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  reauthenticateWithPopup
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isMasterAdmin: boolean;
  isSessionVerified: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  challengeUser: () => Promise<void>;
  setSessionVerified: (verified: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSessionVerified, setIsSessionVerified] = useState(false);
  const MASTER_EMAIL = 'ashwani.sikka@gmail.com';

  const challengeUser = async () => {
    try {
      if (!auth.currentUser) throw new Error("Must be logged in with Google account first");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account',
        auth_type: 'reauthenticate',
        login_hint: auth.currentUser.email || ''
      });
      // This triggers Google's native re-authentication/2FA
      await reauthenticateWithPopup(auth.currentUser, provider);
      setIsSessionVerified(true);
      toast.success("Identity Challenge Successful");
    } catch (error) {
      console.error("Google security challenge failed:", error);
      throw error;
    }
  };

  const generateUniqueUsername = () => {
    const prefix = 'OMAXE';
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${random}`;
  };

  const refreshProfile = async () => {
    if (auth.currentUser) {
      const path = `users/${auth.currentUser.uid}`;
      try {
        const docRef = doc(db, 'users', auth.currentUser.uid);
        const docSnap = await getDoc(docRef);
          const isMasterAdmin = auth.currentUser.email?.toLowerCase() === MASTER_EMAIL;
          
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            
            // Check if blocked
            if (data.isBlocked && !isMasterAdmin) {
              await signOut(auth);
              setProfile(null);
              setUser(null);
              return;
            }

            // Auto-upgrade master email to admin if not already
            if (isMasterAdmin && data.role !== 'admin') {
              await updateDoc(docRef, { role: 'admin' });
              data.role = 'admin';
            }
            setProfile(data);
          } else {
            const newProfile: UserProfile = {
              uid: auth.currentUser.uid,
              email: auth.currentUser.email || '',
              displayName: auth.currentUser.displayName || '',
              username: generateUniqueUsername(),
              role: isMasterAdmin ? 'admin' : 'user',
              createdAt: serverTimestamp() as any,
              phoneNumber: '', // Force registration
              phoneVerified: false,
              isSetupComplete: false
            };
            await setDoc(docRef, newProfile);
            setProfile(newProfile);
          }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, path);
      }
    } else {
      setProfile(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      try {
        if (user) {
          await refreshProfile();
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.error("Auth state change error:", error);
        // We still set loading to false so the UI can respond (likely showing error or auth screen)
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account consent', // Forces account selector AND consent screen to trigger re-auth
      auth_type: 'reauthenticate'     // Specifically requests re-authentication if possible
    });
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
    setIsSessionVerified(false);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      isAdmin: profile?.role === 'admin' || user?.email?.toLowerCase() === MASTER_EMAIL,
      isMasterAdmin: user?.email?.toLowerCase() === MASTER_EMAIL,
      isSessionVerified,
      login, 
      logout,
      refreshProfile,
      challengeUser,
      setSessionVerified: setIsSessionVerified
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}
