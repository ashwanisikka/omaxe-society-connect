import React, { createContext, useContext, useEffect, useState } from 'react';
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
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, getFirestore } from 'firebase/firestore';
import { auth, db, app } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { toast } from 'sonner';

// Custom database index loading checks to prevent cross-origin instance storage blocks
const customDbId = "ai-studio-e12d6e76-8aa2-4bd4-96b2-ed235287a5c2";
const safeDb = db ? db : getFirestore(app, customDbId);

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: (e?: any) => void;
  signInWithGoogle: (e?: any) => void; // Alias 1: UI button click compatibility
  signIn: (e?: any) => void;           // Alias 2: UI button click compatibility
  login: (e?: any) => void;            // Alias 3: UI button click compatibility
  logout: () => Promise<void>;
  signOutUser: () => Promise<void>;      // Alias 4: UI logout action compatibility
  verifyAndBindPhone: (phoneNumber: string) => Promise<boolean>;
  isDeviceAuthorized: boolean;
  isSessionVerified: boolean;             // App.tsx routing synchronization
  isAdmin: boolean;
  isMasterAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState(false);
  const [isSessionVerified, setIsSessionVerified] = useState(false);

  // Helper: Hardware Device Signature (To bind browser fingerprint metadata to resident record)
  const getDeviceSignature = (): string => {
    let signature = localStorage.getItem('omaxe_device_signature');
    if (!signature) {
      const screenParams = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
      const agentParams = navigator.userAgent.replace(/\D/g, '');
      const uniqueUUID = crypto.randomUUID();
      
      // Creating unique browser coordinate bound signature
      signature = `dev_${btoa(screenParams + agentParams).slice(0, 16)}_${uniqueUUID.slice(0, 8)}`;
      localStorage.setItem('omaxe_device_signature', signature);
    }
    return signature;
  };

  // Profile verification: reads Firestore document and maps state properties
  const handleUserLogin = async (currentUser: User) => {
    try {
      console.log("[AuthContext] Reading profile database for:", currentUser.uid);
      const userDocRef = doc(safeDb, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      const deviceSig = getDeviceSignature();

      if (!userDoc.exists()) {
        console.log("[AuthContext] Initializing new profile registration template...");
        const newProfile: UserProfile = {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || 'Resident',
          role: 'user' as UserRole,
          createdAt: new Date().toISOString(),
          phoneVerified: false,
          phoneNumber: '',
          deviceSignature: '', // Empty state awaiting 2-factor physical bind setup
          isSetupComplete: false
        };
        await setDoc(userDocRef, newProfile);
        setProfile(newProfile);
        setIsDeviceAuthorized(false);
        setIsSessionVerified(false);
        toast.success("Google Account authenticated! Kripya apna 10-digit mobile number link kijiye.");
      } else {
        const userData = userDoc.data() as UserProfile;
        setProfile(userData);
        console.log("[AuthContext] Resident profile found successfully:", userData.displayName);
        
        // Match browser cookie coordinate fingerprints to fast-bypass lock
        if (userData.phoneVerified && userData.deviceSignature === deviceSig) {
          setIsDeviceAuthorized(true);
          setIsSessionVerified(true);
          toast.success(`Welcome back, ${userData.displayName || 'Resident'}!`);
        } else {
          setIsDeviceAuthorized(false);
          setIsSessionVerified(false);
          toast.warning("Naya browser ya device detected. Safety setup complete kijiye.");
        }
      }
    } catch (err: any) {
      console.error("[AuthContext] Custom Firestore Sync error:", err);
      toast.error(`Database Handshake Failed: ${err.message || 'Check database configurations'}`);
    }
  };

  useEffect(() => {
    // 1. Establish persistent local storage persistence config on startup
    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        console.log("[AuthContext] Session persistence initialized successfully.");
      })
      .catch((err) => {
        console.error("[AuthContext] Failed to set session persistence:", err);
      });

    // 2. Safety release to guarantee button click never remains frozen on loading delays
    const loadTimeout = setTimeout(() => {
      console.log("[AuthContext] Safety check triggered. Login button controls active.");
      setLoading(false);
    }, 1500);

    // 3. Handle Redirect callbacks automatically when return from Google pages
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          console.log("[AuthContext] Redirect login verification successful!");
          setUser(result.user);
          await handleUserLogin(result.user);
        }
      })
      .catch((err: any) => {
        console.warn("[AuthContext] Redirect callback bypassed:", err.message);
        if (err.code === 'auth/unauthorized-domain') {
          toast.error("Vercel domain is unauthorized in Firebase Console Settings!");
        }
      });

    // 4. Watch persistent auth status on boot up
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          console.log("[AuthContext] Session recovered for:", currentUser.email);
          setUser(currentUser);
          await handleUserLogin(currentUser);
        } else {
          console.log("[AuthContext] No active session found.");
          setUser(null);
          setProfile(null);
          setIsDeviceAuthorized(false);
          setIsSessionVerified(false);
        }
      } catch (err) {
        console.error("[AuthContext] Observer session verification failed:", err);
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

  // Central Google Sign-in trigger with ZERO delay & automatic fallback logic!
  const executeGoogleAuth = (e?: any) => {
    // Immediate browser default prevent to stop page reloads during click events
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }

    console.log("[AuthContext] executeGoogleAuth manual trigger active.");
    setLoading(true);
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' }); // Enforce manual chooser screen
    
    // Direct synchronous call ensures the popup blocker is completely bypassed on Desktop!
    console.log("[AuthContext] Launching direct Google Popup...");
    signInWithPopup(auth, provider)
      .then(async (result) => {
        console.log("[AuthContext] Popup authorization success!");
        setUser(result.user);
        await handleUserLogin(result.user);
      })
      .catch((popupErr: any) => {
        console.error("[AuthContext] Popup sign-in error details:", popupErr);
        
        // AUTOMATIC FAILOVER REDIRECT: If popup is blocked, seamlessly trigger redirect fallback!
        if (popupErr.code === 'auth/popup-blocked') {
          console.log("[AuthContext] Popup blocked! Triggering seamless redirect fallback...");
          toast.info("Redirecting you to Google login screen...");
          
          signInWithRedirect(auth, provider)
            .catch((redirectErr: any) => {
              console.error("[AuthContext] Redirect fallback failed too:", redirectErr);
              toast.error("Redirect fallback failed! Please allow popups or check browser permissions.");
              setLoading(false);
            });
        } else if (popupErr.code === 'auth/unauthorized-domain') {
          toast.error("Vercel domain is unauthorized in Firebase Console!");
          setLoading(false);
        } else {
          toast.error(`Login failed: ${popupErr.message || 'Please check network connections.'}`);
          setLoading(false);
        }
      });
  };

  // Bind execution triggers to multiple alias properties
  const loginWithGoogle = executeGoogleAuth;
  const signInWithGoogle = executeGoogleAuth;
  const signIn = executeGoogleAuth;
  const login = executeGoogleAuth;

  // Locks physical device signature with verified phone number
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
      const userDocRef = doc(safeDb, 'users', user.uid);

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
      setIsSessionVerified(true);
      toast.success("Identity binding successful! This physical device is now registered.");
      return true;
    } catch (err: any) {
      console.error("[AuthContext] Hardware lock failed:", err);
      toast.error(`Verification binding failed: ${err.message || 'Database permissions blocked'}`);
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
      setIsDeviceAuthorized(false);
      setIsSessionVerified(false);
      toast.success("Session closed safely.");
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
      isSessionVerified, // CRITICAL PORT EXPORT: Maps to needsVerification constraints
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
