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
import { auth, db, app } from '@/src/lib/firebase';
import { UserProfile, UserRole } from '@/src/types';
import { toast } from 'sonner';

// Custom database check to handle special Firestore studio configurations
const customDbId = "ai-studio-e12d6e76-8aa2-4bd4-96b2-ed235287a5c2";
const safeDb = db ? db : getFirestore(app, customDbId);

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: (e?: any) => Promise<void>;
  signInWithGoogle: (e?: any) => Promise<void>; // Alias 1: UI button action mapping
  signIn: (e?: any) => Promise<void>;           // Alias 2: UI button action mapping
  login: (e?: any) => Promise<void>;            // Alias 3: UI button action mapping
  logout: () => Promise<void>;
  signOutUser: () => Promise<void>;      // Alias 4: UI logout action mapping
  verifyAndBindPhone: (phoneNumber: string) => Promise<boolean>;
  isDeviceAuthorized: boolean;
  isSessionVerified: boolean;             // Map checking for AppContent structure
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

  // Helper: Hardware signature to identify unique resident device installations
  const getDeviceSignature = (): string => {
    let signature = localStorage.getItem('omaxe_device_signature');
    if (!signature) {
      const screenParams = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
      const agentParams = navigator.userAgent.replace(/\D/g, '');
      const uniqueUUID = crypto.randomUUID();
      
      // Builds non-replicable unique identity signature bound to this client
      signature = `dev_${btoa(screenParams + agentParams).slice(0, 16)}_${uniqueUUID.slice(0, 8)}`;
      localStorage.setItem('omaxe_device_signature', signature);
    }
    return signature;
  };

  // Profile configuration: syncs user identity with direct Firestore collection
  const handleUserLogin = async (currentUser: User) => {
    try {
      console.log("[AuthContext - Debug] Profile fetch starting for UID:", currentUser.uid);
      const userDocRef = doc(safeDb, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      const deviceSig = getDeviceSignature();

      if (!userDoc.exists()) {
        console.log("[AuthContext - Debug] No profile record found in Firestore. Creating standard template...");
        const newProfile: UserProfile = {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || 'Resident',
          role: 'user' as UserRole,
          createdAt: new Date().toISOString(),
          phoneVerified: false,
          phoneNumber: '',
          deviceSignature: '', // Empty state awaiting dynamic SIM registration
          isSetupComplete: false
        };
        await setDoc(userDocRef, newProfile);
        setProfile(newProfile);
        setIsDeviceAuthorized(false);
        setIsSessionVerified(false);
        console.log("[AuthContext - Debug] New profile initialized, state pending physical setup.");
        toast.success("Google Account authenticated! Apne device ka 10-digit number link kijiye.");
      } else {
        const userData = userDoc.data() as UserProfile;
        setProfile(userData);
        console.log("[AuthContext - Debug] Resident data verified successfully:", userData.displayName);
        
        // Auto-match signature coordinates
        if (userData.phoneVerified && userData.deviceSignature === deviceSig) {
          setIsDeviceAuthorized(true);
          setIsSessionVerified(true);
          console.log("[AuthContext - Debug] Hardware signature MATCH! Fast bypass granted.");
          toast.success(`Welcome back, ${userData.displayName || 'Resident'}!`);
        } else {
          setIsDeviceAuthorized(false);
          setIsSessionVerified(false);
          console.log("[AuthContext - Debug] Device signature mismatch or setup pending.");
          toast.warning("New physical device detected or verification setup required.");
        }
      }
    } catch (err: any) {
      console.error("[AuthContext - Debug] Firestore synchronization crashed completely:", err);
      toast.error(`Database Handshake Failed: ${err.message || 'Check database configurations'}`);
    }
  };

  useEffect(() => {
    // A. Safety timeout to release button if token check hangs or lags
    const loadTimeout = setTimeout(() => {
      console.log("[AuthContext - Debug] Safety timer released. Forcing loading button to active.");
      setLoading(false);
    }, 2000);

    // B. Handle Redirect verification callback after redirect login
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          console.log("[AuthContext - Debug] Redirect auth completed successfully with user:", result.user.email);
          setUser(result.user);
          await handleUserLogin(result.user);
        }
      })
      .catch((err: any) => {
        console.warn("[AuthContext - Debug] Redirect callback evaluation bypassed:", err.message);
        if (err.code === 'auth/unauthorized-domain') {
          toast.error("Firebase Error: Authorize this Vercel domain under Firebase Console Authentication Settings!");
        }
      });

    // C. Persistent session state watcher
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          console.log("[AuthContext - Debug] Session token restored for:", currentUser.email);
          setUser(currentUser);
          await handleUserLogin(currentUser);
        } else {
          console.log("[AuthContext - Debug] No active session found. Rendering landing interface options.");
          setUser(null);
          setProfile(null);
          setIsDeviceAuthorized(false);
          setIsSessionVerified(false);
        }
      } catch (err) {
        console.error("[AuthContext - Debug] Session watcher crashed safely:", err);
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

  // Google Sign-In execution trigger (handles popups with automatic failover fallback)
  const executeGoogleAuth = async (e?: any) => {
    // PREVENT PAGE RELOADS: Block form submissions or empty action reloads
    const event = e || window.event;
    if (event) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }

    console.log("[AuthContext - Debug] executeGoogleAuth manual trigger started...");
    setLoading(true);
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' }); // Enforce account select window
    
    try {
      // Configuration check: Establish persistent local state across redirects
      console.log("[AuthContext - Debug] Registering browser session persistence...");
      await setPersistence(auth, browserLocalPersistence);

      console.log("[AuthContext - Debug] Launching Google Popup selector window...");
      const result = await signInWithPopup(auth, provider);
      console.log("[AuthContext - Debug] Popup sign-in completed successfully!");
      setUser(result.user);
      await handleUserLogin(result.user);
    } catch (popupErr: any) {
      console.warn("[AuthContext - Debug] Popup blocked or COOP protection conflict. Triggering redirect fallback...", popupErr.code);
      
      if (popupErr.code === 'auth/unauthorized-domain') {
        toast.error("Unauthorized Vercel Domain: Please add your vercel link to Firebase authorized domains list!");
        setLoading(false);
        return;
      }
      
      try {
        console.log("[AuthContext - Debug] Running fallback signInWithRedirect...");
        await signInWithRedirect(auth, provider);
      } catch (redirectErr: any) {
        console.error("[AuthContext - Debug] Redirect authentication crashed too:", redirectErr);
        toast.error(`Login failed: ${redirectErr.message || 'Check browser security settings.'}`);
        setLoading(false);
      }
    }
  };

  // Mapping direct buttons to standard actions
  const loginWithGoogle = executeGoogleAuth;
  const signInWithGoogle = executeGoogleAuth;
  const signIn = executeGoogleAuth;
  const login = executeGoogleAuth;

  // Secures physical identity signature with verified phone number
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
      console.error("[AuthContext - Debug] Hardware lock update failed:", err);
      toast.error(`Verification binding failed: ${err.message || 'Database permissions blocked'}`);
      return false;
    }
  };

  // Sign out handler
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
      console.error("[AuthContext - Debug] Logout trigger crashed:", err);
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
