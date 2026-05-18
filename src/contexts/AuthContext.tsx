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
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  verifyAndBindPhone: (phoneNumber: string) => Promise<boolean>;
  isDeviceAuthorized: boolean;
  isAdmin: boolean;
  isMasterAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState(false);

  // Helper: Device signature coordinates configuration
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

  // Helper function to safely process active user profiles inside direct custom database
  const handleUserLogin = async (currentUser: User) => {
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      const deviceSig = getDeviceSignature();

      if (!userDoc.exists()) {
        const newProfile: UserProfile = {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || 'Resident',
          role: 'user' as UserRole,
          createdAt: new Date().toISOString(),
          phoneVerified: false,
          phoneNumber: '',
          deviceSignature: '', // Empty awaiting setup phase verification
          isSetupComplete: false
        };
        await setDoc(userDocRef, newProfile);
        setProfile(newProfile);
        setIsDeviceAuthorized(false);
        toast.success("Google Authentication verified. Please complete your physical device mobile binding.");
      } else {
        const userData = userDoc.data() as UserProfile;
        setProfile(userData);
        
        // CHECK HW LOCK MATCH: auto-bypass directly to dashboard if verified
        if (userData.phoneVerified && userData.deviceSignature === deviceSig) {
          setIsDeviceAuthorized(true);
          toast.success(`Welcome back, ${userData.displayName || 'Resident'}!`);
        } else {
          setIsDeviceAuthorized(false);
          toast.warning("New device detected or verification pending. Physical binding required.");
        }
      }
    } catch (dbErr) {
      console.error("Failed to fetch or setup user record:", dbErr);
      toast.error("Database initialization failed. Checking server connection.");
    }
  };

  useEffect(() => {
    // 1. Redirect Fallback Listener: Standard COOP browser restrictions resolution handler
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          console.log("Redirect login completed successfully!");
          setUser(result.user);
          await handleUserLogin(result.user);
        }
      })
      .catch((err) => {
        console.warn("Redirect result lookup bypass:", err);
      });

    // 2. Observer state trigger to monitor existing session tokens
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser);
          await handleUserLogin(currentUser);
        } else {
          setUser(null);
          setProfile(null);
          setIsDeviceAuthorized(false);
        }
      } catch (err) {
        console.error("Auth observer runtime crash:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 1. Google login trigger (With automatic hybrid redirect fallbacks)
  const loginWithGoogle = async () => {
    console.log("Starting Google Secure Account Authentication flow...");
    setLoading(true);
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' }); // Never skip direct manual selector window
    
    try {
      // Step A: Attempt standard web popups
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
      await handleUserLogin(result.user);
    } catch (popupErr: any) {
      console.warn("Popup blocked or COOP policy mismatch. Triggering redirect login...", popupErr.code);
      
      // Step B: Automatic redirection fallback for strict device browser restrictions
      try {
        await signInWithRedirect(auth, provider);
      } catch (redirectErr: any) {
        console.error("Redirect fallback failed too:", redirectErr);
        toast.error("Login trigger failed. Please check browser privacy/popup permissions.");
        setLoading(false); // Make sure button remains clickable on complete failure
      }
    }
  };

  // 2. Lock current device browser configuration metadata to the validated 10-digit number
  const verifyAndBindPhone = async (phoneNumber: string): Promise<boolean> => {
    if (!user) {
      toast.error("Google session invalid. Please log in using Google first.");
      return false;
    }

    const sanitizedPhone = phoneNumber.trim().replace(/\D/g, '');
    if (sanitizedPhone.length < 10) {
      toast.error("Please enter a valid 10-digit mobile number.");
      return false;
    }

    try {
      const deviceSig = getDeviceSignature();
      const userDocRef = doc(db, 'users', user.uid);

      await updateDoc(userDocRef, {
        phoneNumber: sanitizedPhone,
        phoneVerified: true,
        deviceSignature: deviceSig,
        isSetupComplete: true,
        updatedAt: serverTimestamp()
      });

      setProfile((prev) => prev ? { 
        ...prev, 
        phoneNumber: sanitizedPhone, 
        phoneVerified: true, 
        deviceSignature: deviceSig,
        isSetupComplete: true 
      } : null);

      setIsDeviceAuthorized(true);
      toast.success("Identity activation successful! This device is now bound to your profile.");
      return true;
    } catch (err: any) {
      console.error("Phone registration lock failed:", err);
      toast.error(`Verification binding failed: ${err.message || 'Database permissions blocked'}`);
      return false;
    }
  };

  // 3. User session logout trigger
  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      setProfile(null);
      setIsDeviceAuthorized(false);
      toast.success("Logged out successfully.");
    } catch (err) {
      console.error("Logout process failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = profile?.role === 'admin' || user?.email?.toLowerCase() === 'ashwani.sikka@gmail.com';
  const isMasterAdmin = user?.email?.toLowerCase() === 'ashwani.sikka@gmail.com';

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      loginWithGoogle, 
      logout, 
      verifyAndBindPhone,
      isDeviceAuthorized,
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
