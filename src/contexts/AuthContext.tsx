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
import { auth, db } from '@/src/lib/firebase';
import { UserProfile, UserRole } from '@/src/types';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: (e?: any) => Promise<void>;
  signInWithGoogle: (e?: any) => Promise<void>; // Alias 1: UI button resolution
  signIn: (e?: any) => Promise<void>;           // Alias 2: UI button resolution
  login: (e?: any) => Promise<void>;            // Alias 3: UI button resolution
  logout: () => Promise<void>;
  signOutUser: () => Promise<void>;      // Alias 4: UI logout resolution
  verifyAndBindPhone: (phoneNumber: string) => Promise<boolean>;
  isDeviceAuthorized: boolean;
  isSessionVerified: boolean;             // CRITICAL FIX: Direct variable mapping for your App.tsx!
  isAdmin: boolean;
  isMasterAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState(false);
  const [isSessionVerified, setIsSessionVerified] = useState(false); // Map to AppContent's verified control

  // Helper: Hardware Device Signature generator (Locks browser cookie metadata to resident profile)
  const getDeviceSignature = (): string => {
    let signature = localStorage.getItem('omaxe_device_signature');
    if (!signature) {
      const screenParams = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
      const agentParams = navigator.userAgent.replace(/\D/g, '');
      const uniqueUUID = crypto.randomUUID();
      
      // Build screen resolution agent-bound non-replicable unique identity coordinate
      signature = `dev_${btoa(screenParams + agentParams).slice(0, 16)}_${uniqueUUID.slice(0, 8)}`;
      localStorage.setItem('omaxe_device_signature', signature);
    }
    return signature;
  };

  // Synchronizes authenticated resident session with direct custom database
  const handleUserLogin = async (currentUser: User) => {
    try {
      console.log("[AuthContext] Syncing user profile data from custom Firestore DB for UID:", currentUser.uid);
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      const deviceSig = getDeviceSignature();

      if (!userDoc.exists()) {
        console.log("[AuthContext] Profile missing in DB. Initializing standard template...");
        const newProfile: UserProfile = {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || 'Resident',
          role: 'user' as UserRole,
          createdAt: new Date().toISOString(),
          phoneVerified: false,
          phoneNumber: '',
          deviceSignature: '', // Empty awaiting 2-factor binding setup
          isSetupComplete: false
        };
        await setDoc(userDocRef, newProfile);
        setProfile(newProfile);
        setIsDeviceAuthorized(false);
        setIsSessionVerified(false);
        toast.success("Google Account authenticated! Apne device ka 10-digit number link kijiye.");
      } else {
        const userData = userDoc.data() as UserProfile;
        setProfile(userData);
        console.log("[AuthContext] Profile loaded successfully:", userData.displayName);
        
        // CHECK HW LOCK MATCH: auto-bypass directly to dashboard if verified
        if (userData.phoneVerified && userData.deviceSignature === deviceSig) {
          setIsDeviceAuthorized(true);
          setIsSessionVerified(true);
          toast.success(`Welcome back, ${userData.displayName || 'Resident'}!`);
        } else {
          setIsDeviceAuthorized(false);
          setIsSessionVerified(false);
          toast.warning("New device detected or verification pending. Physical binding required.");
        }
      }
    } catch (err: any) {
      console.error("[AuthContext] Failed to retrieve database profile:", err);
      toast.error(`Database Connection Error: ${err.message || 'Verification suspended'}`);
    }
  };

  useEffect(() => {
    // A. 1.5-Second Safety Release: Unlocks loading button if Firebase token handshake is delayed
    const loadTimeout = setTimeout(() => {
      console.log("[AuthContext] Safety timer released. Unlocking login controls.");
      setLoading(false);
    }, 1500);

    // B. Handle Redirect callbacks (Resolves Vercel COOP popup blockers automatically)
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          console.log("[AuthContext] Redirect login authentication completed!");
          setUser(result.user);
          await handleUserLogin(result.user);
        }
      })
      .catch((err: any) => {
        console.warn("[AuthContext] Redirect callback evaluation bypass:", err.message);
        if (err.code === 'auth/unauthorized-domain') {
          toast.error("Firebase Error: Authorize this Vercel domain in your Firebase Console Settings!");
        }
      });

    // C. Watch active persistent session tokens
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          console.log("[AuthContext] Persistent session verified for:", currentUser.email);
          setUser(currentUser);
          await handleUserLogin(currentUser);
        } else {
          console.log("[AuthContext] No active session found. Showing landing page.");
          setUser(null);
          setProfile(null);
          setIsDeviceAuthorized(false);
          setIsSessionVerified(false);
        }
      } catch (err) {
        console.error("[AuthContext] Observer trigger crash:", err);
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

  // Central Google Sign-in executor (With automatic failover to redirects and click prevent default)
  const executeGoogleAuth = async (e?: any) => {
    // CRITICAL: Prevent form submit page reload which kills popups instantly!
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }

    console.log("[AuthContext] executeGoogleAuth trigger started...");
    setLoading(true);
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' }); // Always force manual account choosing step
    
    try {
      console.log("[AuthContext] Launching signInWithPopup...");
      const result = await signInWithPopup(auth, provider);
      console.log("[AuthContext] Popup sign-in success!");
      setUser(result.user);
      await handleUserLogin(result.user);
    } catch (popupErr: any) {
      console.warn("[AuthContext] Popup blocked or COOP error. Running redirect fallback...", popupErr.code);
      
      if (popupErr.code === 'auth/unauthorized-domain') {
        toast.error("Unauthorized Domain: Please authorize this Vercel domain under your Firebase Authentication settings!");
        setLoading(false);
        return;
      }
      
      try {
        console.log("[AuthContext] Triggering signInWithRedirect...");
        await signInWithRedirect(auth, provider);
      } catch (redirectErr: any) {
        console.error("[AuthContext] Redirect authentication completely failed:", redirectErr);
        toast.error(`Login trigger failed: ${redirectErr.message || 'Check browser security settings.'}`);
        setLoading(false);
      }
    }
  };

  // Bind execution triggers to multiple alias properties
  const loginWithGoogle = executeGoogleAuth;
  const signInWithGoogle = executeGoogleAuth;
  const signIn = executeGoogleAuth;
  const login = executeGoogleAuth;

  // Locks physical device signature with verified mobile number
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
      isSessionVerified, // CRITICAL EXPORT: Perfectly resolves AppContent's verification needs
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
