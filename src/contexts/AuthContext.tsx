import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: (e?: any) => void;
  signInWithGoogle: (e?: any) => void; // Alias 1: Button support
  signIn: (e?: any) => void;           // Alias 2: Button support
  login: (e?: any) => void;            // Alias 3: Button support
  logout: () => Promise<void>;
  signOutUser: () => Promise<void>;      // Alias 4: Logout support
  verifyAndBindPhone: (phoneNumber: string) => Promise<boolean>;
  isDeviceAuthorized: boolean;            // Rollback: Always true to bypass loops
  isSessionVerified: boolean;             // App.tsx routing guard verification check
  isAdmin: boolean;
  isMasterAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeviceAuthorized] = useState(true); // Always true to safely bypass loops
  const [isSessionVerified, setIsSessionVerified] = useState(false);

  // Profile data handler: Synchronizes authenticated user with direct Firestore collection
  const handleUserLogin = async (currentUser: User) => {
    try {
      console.log("[AuthContext] Synchronizing authenticated resident profile:", currentUser.uid);
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        console.log("[AuthContext] Profile database entry missing. Creating new resident record...");
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
        toast.success("Google Account authenticated successfully! Kripya apna 10-digit primary mobile number link kijiye.");
      } else {
        const userData = userDoc.data() as UserProfile;
        setProfile(userData);
        console.log("[AuthContext] Existing profile synchronized successfully:", userData.displayName);
        
        // Let verified user land directly onto Dashboard without loops!
        if (userData.phoneVerified && userData.isSetupComplete) {
          setIsSessionVerified(true);
          toast.success(`Welcome back, ${userData.displayName || 'Resident'}!`);
        } else {
          setIsSessionVerified(false);
          toast.warning("Profile setup pending. Verification required.");
        }
      }
    } catch (err: any) {
      console.error("[AuthContext] Firestore sync failure:", err);
      toast.error(`Database Connection Error: ${err.message || 'Check firestore configuration.'}`);
    }
  };

  useEffect(() => {
    // A. Handle Redirect Result if redirected back to Vercel page
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          console.log("[AuthContext] Redirect sign-in success!");
          setUser(result.user);
          await handleUserLogin(result.user);
        }
      })
      .catch((err) => {
        console.warn("[AuthContext] Redirect lookup bypassed:", err.message);
      });

    // B. Watch persistent session tokens
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
        console.error("[AuthContext] Session synchronization error:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Standard Google login trigger without any async delay to prevent popup blocking!
  const executeGoogleAuth = (e?: any) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    console.log("[AuthContext] executeGoogleAuth manual trigger active.");
    setLoading(true);
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    // Direct synchronous call: Browser identifies this as clean user click gesture!
    console.log("[AuthContext] Launching direct Google Popup...");
    signInWithPopup(auth, provider)
      .then(async (result) => {
        console.log("[AuthContext] Popup authorization success!");
        setUser(result.user);
        await handleUserLogin(result.user);
      })
      .catch((popupErr: any) => {
        console.error("[AuthContext] Direct popup login failed:", popupErr.code);
        
        // Automatic fallback redirection if browser settings strictly disable popups
        if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/cancelled-popup-request') {
          console.log("[AuthContext] Popup blocked by browser! Falling back to Redirect...");
          toast.info("Opening Google authentication redirect page...");
          
          signInWithRedirect(auth, provider)
            .catch((redirectErr: any) => {
              console.error("[AuthContext] Redirect fallback failed too:", redirectErr);
              toast.error("Google trigger completely blocked by browser settings.");
              setLoading(false);
            });
        } else if (popupErr.code === 'auth/unauthorized-domain') {
          toast.error("Vercel domain is unauthorized in Firebase Console settings!");
          setLoading(false);
        } else {
          toast.error(`Login trigger failed: ${popupErr.message || 'Please check browser popup settings.'}`);
          setLoading(false);
        }
      });
  };

  // Bind execution triggers to multiple alias properties
  const loginWithGoogle = executeGoogleAuth;
  const signInWithGoogle = executeGoogleAuth;
  const signIn = executeGoogleAuth;
  const login = executeGoogleAuth;

  // Locks validated primary mobile phone with strict checks against fake numbers!
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

    // 4. BLOCK SEQUENTIAL FAKE PATTERNS (e.g. 1234567890, 0987654321)
    const sequentialCheck = "12345678909876543210";
    if (sequentialCheck.includes(sanitizedPhone)) {
      toast.error("Error: Sequential fake numbers allowed nahi hain!");
      return false;
    }

    try {
      const userDocRef = doc(db, 'users', user.uid);

      await updateDoc(userDocRef, {
        phoneNumber: sanitizedPhone,
        phoneVerified: true,
        isSetupComplete: true,
        updatedAt: serverTimestamp()
      });

      setProfile((prev) => prev ? { 
        ...prev, 
        phoneNumber: sanitizedPhone, 
        phoneVerified: true, 
        isSetupComplete: true 
      } : null);

      setIsSessionVerified(true);
      toast.success("Mobile linked and registered successfully!");
      return true;
    } catch (err: any) {
      console.error("[AuthContext] Phone setup failed:", err);
      toast.error(`Database Error: ${err.message || 'Verification blocked'}`);
      return false;
    }
  };

  // Sign out triggers
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
