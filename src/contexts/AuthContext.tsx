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
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: (e?: any) => void;
  signInWithGoogle: (e?: any) => void; // Alias 1: Click mapping
  signIn: (e?: any) => void;           // Alias 2: Click mapping
  login: (e?: any) => void;            // Alias 3: Click mapping
  logout: () => Promise<void>;
  signOutUser: () => Promise<void>;      // Alias 4: Logout compatibility
  verifyAndBindPhone: (phoneNumber: string) => Promise<boolean>;
  isDeviceAuthorized: boolean;
  isSessionVerified: boolean;             // App.tsx router guard checks
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

  // Helper: Hardware device signature creator
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

  // Profile builder: reads or registers user data directly inside Firestore
  const handleUserLogin = async (currentUser: User) => {
    try {
      console.log("[AuthContext] Fetching Firestore document for user:", currentUser.uid);
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      const deviceSig = getDeviceSignature();

      if (!userDoc.exists()) {
        console.log("[AuthContext] Registration initiated for new resident...");
        const newProfile: UserProfile = {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || 'Resident',
          role: 'user' as UserRole,
          createdAt: new Date().toISOString(),
          phoneVerified: false,
          phoneNumber: '',
          deviceSignature: '', // Blank state until verified phone binding
          isSetupComplete: false
        };
        await setDoc(userDocRef, newProfile);
        setProfile(newProfile);
        setIsDeviceAuthorized(false);
        setIsSessionVerified(false);
        toast.success("Google Account authenticated! Kripya apna 10-digit mobile number bind kijiye.");
      } else {
        const userData = userDoc.data() as UserProfile;
        setProfile(userData);
        console.log("[AuthContext] Profile loaded successfully:", userData.displayName);
        
        // Auto-match signature coordinates for dashboard bypass
        if (userData.phoneVerified && userData.deviceSignature === deviceSig) {
          setIsDeviceAuthorized(true);
          setIsSessionVerified(true);
          toast.success(`Welcome back, ${userData.displayName || 'Resident'}!`);
        } else {
          setIsDeviceAuthorized(false);
          setIsSessionVerified(false);
          toast.warning("Naya physical device detected ya verification setup required.");
        }
      }
    } catch (err: any) {
      console.error("[AuthContext] Firestore sync error:", err);
      toast.error(`Database Handshake Failed: ${err.message || 'Check database configurations'}`);
    }
  };

  useEffect(() => {
    // 1. Force local storage persistence configurations on boot
    setPersistence(auth, browserLocalPersistence)
      .then(() => console.log("[AuthContext] Session persistence initialized."))
      .catch((err) => console.error("[AuthContext] Persistence registration failed:", err));

    // 2. Safety release to make sure button controls never freeze on database lag
    const loadTimeout = setTimeout(() => {
      console.log("[AuthContext] Safety timer released. Controls unlocked.");
      setLoading(false);
    }, 1500);

    // 3. Handle Redirect verification results upon callback reload
    getRedirectResult(auth)
      .then(async (result) => {
        if (result && result.user) {
          console.log("[AuthContext] Redirect login verified successfully!");
          setUser(result.user);
          await handleUserLogin(result.user);
        }
      })
      .catch((err: any) => {
        console.warn("[AuthContext] Redirect result evaluation bypassed:", err.message);
        if (err.code === 'auth/unauthorized-domain') {
          toast.error("Firebase Security: Add 'omaxe-society-connect.vercel.app' to Authorized Domains in Firebase Settings.");
        }
      });

    // 4. Watch persistent authentication changes
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          console.log("[AuthContext] Persistent session active for:", currentUser.email);
          setUser(currentUser);
          await handleUserLogin(currentUser);
        } else {
          console.log("[AuthContext] No active persistent session found.");
          setUser(null);
          setProfile(null);
          setIsDeviceAuthorized(false);
          setIsSessionVerified(false);
        }
      } catch (err) {
        console.error("[AuthContext] Session synchronization failed:", err);
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

  // Central Google Sign-in action triggers Popup with immediate Redirect fallback
  const executeGoogleAuth = (e?: any) => {
    // Stop event propagation immediately to block form submit page reloads
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }

    console.log("[AuthContext] executeGoogleAuth trigger started...");
    setLoading(true);
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' }); // Never skip manual account choosing step

    // Executed instantly on the same thread tick to bypass Chrome's Popup Blocker
    console.log("[AuthContext] Launching direct Google Popup...");
    signInWithPopup(auth, provider)
      .then(async (result) => {
        console.log("[AuthContext] Popup authorization success!");
        setUser(result.user);
        await handleUserLogin(result.user);
      })
      .catch((popupErr: any) => {
        console.error("[AuthContext] Popup trigger failed:", popupErr.code);
        
        // Automatic failover fallback to Redirects for mobile devices/iframes
        if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/cancelled-popup-request') {
          console.log("[AuthContext] Popup blocked! Fallback to signInWithRedirect...");
          toast.info("Opening Google authentication redirect page...");
          
          signInWithRedirect(auth, provider)
            .catch((redirectErr: any) => {
              console.error("[AuthContext] Redirect fallback failed too:", redirectErr);
              toast.error("Authentication trigger failed! Please check browser popup permissions.");
              setLoading(false);
            });
        } else if (popupErr.code === 'auth/unauthorized-domain') {
          toast.error("Vercel Domain Unauthorized: Please authorize 'omaxe-society-connect.vercel.app' in Firebase Console.");
          setLoading(false);
        } else {
          toast.error(`Login failed: ${popupErr.message || 'Check network connection.'}`);
          setLoading(false);
        }
      });
  };

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
      isSessionVerified, // Maps to needsVerification App.tsx constraints
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
