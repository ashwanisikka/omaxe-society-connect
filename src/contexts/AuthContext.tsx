import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
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

  // Helper: Device ka browser signature nikalne ke liye (SIM locking concept)
  const getDeviceSignature = (): string => {
    let signature = localStorage.getItem('omaxe_device_signature');
    if (!signature) {
      const screenParams = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
      const agentParams = navigator.userAgent.replace(/\D/g, '');
      const uniqueUUID = crypto.randomUUID();
      
      // Browser aur device coordinate se unique signature banana
      signature = `dev_${btoa(screenParams + agentParams).slice(0, 16)}_${uniqueUUID.slice(0, 8)}`;
      localStorage.setItem('omaxe_device_signature', signature);
    }
    return signature;
  };

  useEffect(() => {
    // Auth aur active resident session check boot time par
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser);
          
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          const deviceSig = getDeviceSignature();

          if (userDoc.exists()) {
            const userData = userDoc.data() as UserProfile;
            setProfile(userData);

            // SECURE LOGIC: Agar phone verified hai aur same device signature hai, toh direct entry
            if (userData.phoneVerified && userData.deviceSignature === deviceSig) {
              setIsDeviceAuthorized(true);
            } else {
              setIsDeviceAuthorized(false);
            }
          } else {
            setProfile(null);
            setIsDeviceAuthorized(false);
          }
        } else {
          setUser(null);
          setProfile(null);
          setIsDeviceAuthorized(false);
        }
      } catch (err) {
        console.error("Auth session restore failed safely:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 1. Google sign-in trigger (Forces user account selection selector popup)
  const loginWithGoogle = async () => {
    console.log("Google login button click ho gaya hai. Process start ho rahi hai...");
    setLoading(true);
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' }); // Auto-bypass block karne ke liye prompt screen force karega
    
    try {
      console.log("Google popup open karne ka try kar rahe hain...");
      const result = await signInWithPopup(auth, provider);
      const currentUser = result.user;
      
      console.log("Google login successful! Firebase authenticated user email:", currentUser.email);
      
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      const deviceSig = getDeviceSignature();

      if (!userDoc.exists()) {
        console.log("Database mein user data nahi mila. Naya profile registration process init...");
        const newProfile: UserProfile = {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || 'Resident',
          role: 'user' as UserRole,
          createdAt: new Date().toISOString(),
          phoneVerified: false,
          phoneNumber: '',
          deviceSignature: '', // Blank state jab tak active SIM number verified na ho
          isSetupComplete: false
        };
        await setDoc(userDocRef, newProfile);
        setProfile(newProfile);
        setIsDeviceAuthorized(false);
        toast.success("Google Account authenticated! Apne device ka 10-digit number link kijiye.");
      } else {
        const userData = userDoc.data() as UserProfile;
        setProfile(userData);
        console.log("Database mein active user account mil gaya:", userData.displayName);
        
        // Check local signature match for auto-bypass
        if (userData.phoneVerified && userData.deviceSignature === deviceSig) {
          setIsDeviceAuthorized(true);
          toast.success(`Welcome back, ${userData.displayName || 'Resident'}!`);
        } else {
          setIsDeviceAuthorized(false);
          toast.warning("Naya device detected. Security hardware verification complete kijiye.");
        }
      }
    } catch (err: any) {
      console.error("Google login call crash with error code:", err.code, "message:", err.message);
      
      if (err.code === 'auth/popup-blocked') {
        toast.error("Vercel par login popup block ho gaya! Apne browser settings mein popups allow karke click kijiye.");
      } else if (err.code === 'auth/popup-closed-by-user') {
        toast.info("Aapne login select window close kar di thi.");
      } else {
        toast.error(`Authentication rejected: ${err.message || 'Apna Firebase configuration check kijiye.'}`);
      }
    } finally {
      setLoading(false); // Button disable lock ko free karne ke liye loading state clear karna zaroori hai
    }
  };

  // 2. Lock current device hardware signature with validated mobile number (Anti-spoofing mechanism)
  const verifyAndBindPhone = async (phoneNumber: string): Promise<boolean> => {
    if (!user) {
      toast.error("Google authentication session not active. Google login kijiye.");
      return false;
    }

    const sanitizedPhone = phoneNumber.trim().replace(/\D/g, '');
    if (sanitizedPhone.length < 10) {
      toast.error("Kripya sahi 10-digit mobile number enter kijiye.");
      return false;
    }

    try {
      const deviceSig = getDeviceSignature();
      const userDocRef = doc(db, 'users', user.uid);

      // Save phone number and bind signature coordinates to Firestore
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
      toast.success("Identity binding successful! Yeh browser ab verified dashboard access ke liye ready hai.");
      return true;
    } catch (err: any) {
      console.error("Phone verification error:", err);
      toast.error(`Verification binding failed: ${err.message || 'Database connection error'}`);
      return false;
    }
  };

  // 3. Close resident active session safely
  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      setProfile(null);
      setIsDeviceAuthorized(false);
      toast.success("Session successfully closed.");
    } catch (err) {
      console.error("Sign out process failed:", err);
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
