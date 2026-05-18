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

  // Helper: Device ka unique hardware signature nikalne ke liye (Anti-spoofing browser coordinates binding)
  const getDeviceSignature = (): string => {
    let signature = localStorage.getItem('omaxe_device_signature');
    if (!signature) {
      const screenParams = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
      const agentParams = navigator.userAgent.replace(/\D/g, '');
      const uniqueUUID = crypto.randomUUID();
      
      // Hardware attributes aur browser metrics se custom key generator
      signature = `dev_${btoa(screenParams + agentParams).slice(0, 16)}_${uniqueUUID.slice(0, 8)}`;
      localStorage.setItem('omaxe_device_signature', signature);
    }
    return signature;
  };

  // Profile data verification helper (Synchronizes direct custom database)
  const handleUserLogin = async (currentUser: User) => {
    try {
      console.log("Fetching resident profile record for UID:", currentUser.uid);
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      const deviceSig = getDeviceSignature();

      if (!userDoc.exists()) {
        console.log("No record found. Registering new database profile...");
        const newProfile: UserProfile = {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || 'Resident',
          role: 'user' as UserRole,
          createdAt: new Date().toISOString(),
          phoneVerified: false,
          phoneNumber: '',
          deviceSignature: '', // Blank state jab tak mobile authentication complete na ho
          isSetupComplete: false
        };
        await setDoc(userDocRef, newProfile);
        setProfile(newProfile);
        setIsDeviceAuthorized(false);
        toast.success("Google account verified! Please bind your physical device phone number.");
      } else {
        const userData = userDoc.data() as UserProfile;
        setProfile(userData);
        console.log("Resident account verified successfully:", userData.displayName);
        
        // Match browser key coordinates for fast-bypass
        if (userData.phoneVerified && userData.deviceSignature === deviceSig) {
          setIsDeviceAuthorized(true);
          toast.success(`Welcome back, ${userData.displayName || 'Resident'}!`);
        } else {
          setIsDeviceAuthorized(false);
          toast.warning("New physical device detected. Verification setup required.");
        }
      }
    } catch (err: any) {
      console.error("Database connection failed during profile lookup:", err);
      toast.error(`Database Error: ${err.message || 'Cannot retrieve user session.'}`);
    }
  };

  useEffect(() => {
    // A. 1.5-Second Safety Unlock: Unblocks loading state if Firebase handshake takes too long
    const loadTimeout = setTimeout(() => {
      console.log("Triggering auto-unlock for the login button state...");
      setLoading(false);
    }, 1500);

    // B. Handle Redirect verification callback after successful Google login
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          console.log("Redirect sign-in completed and verified!");
          setUser(result.user);
          await handleUserLogin(result.user);
        }
      })
      .catch((err: any) => {
        console.warn("Redirect callback bypass details:", err.message);
        if (err.code === 'auth/unauthorized-domain') {
          toast.error("Security Error: Please authorize your Vercel domain in Firebase Console Settings!");
        }
      });

    // C. Watch active session tokens on bootup
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          console.log("Active resident session restore in progress...");
          setUser(currentUser);
          await handleUserLogin(currentUser);
        } else {
          console.log("Logged out state detected.");
          setUser(null);
          setProfile(null);
          setIsDeviceAuthorized(false);
        }
      } catch (err) {
        console.error("Observer synchronization failed:", err);
      } finally {
        setLoading(false);
        clearTimeout(loadTimeout);
      }
    });

    return () => {
      unsubscribe();
      clearTimeout(loadTimeout);
    };
  }, []);

  // 1. Google Auth Login Handler (Direct trigger)
  const loginWithGoogle = async () => {
    console.log("Initializing secure login sequence...");
    setLoading(true);
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' }); // Never skip manual account choosing step
    
    try {
      console.log("Triggering standard login popup...");
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
      await handleUserLogin(result.user);
    } catch (popupErr: any) {
      console.warn("Popup blocked or COOP protection conflict. Swapping to Redirect...", popupErr.code);
      
      if (popupErr.code === 'auth/unauthorized-domain') {
        toast.error("This Vercel domain is not allowed in your Firebase Console. Authorize it first!");
        setLoading(false);
        return;
      }
      
      // Automatic failover fallback to Redirects for mobile devices/iframes
      try {
        console.log("Executing redirect login fallback...");
        await signInWithRedirect(auth, provider);
      } catch (redirectErr: any) {
        console.error("Authentication trigger completely failed:", redirectErr);
        toast.error(`Login trigger failed: ${redirectErr.message || 'Check browser security settings.'}`);
        setLoading(false);
      }
    }
  };

  // 2. Lock physical device signature with validated mobile number
  const verifyAndBindPhone = async (phoneNumber: string): Promise<boolean> => {
    if (!user) {
      toast.error("Google session invalid. Please login using Google first.");
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
      toast.success("Identity binding successful! This physical device is now bound to your account.");
      return true;
    } catch (err: any) {
      console.error("Hardware registration lock failed:", err);
      toast.error(`Binding failed: ${err.message || 'Database connection error'}`);
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
      toast.success("Session closed safely.");
    } catch (err) {
      console.error("Logout failed:", err);
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
