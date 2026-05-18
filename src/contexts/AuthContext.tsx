import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: (e?: any) => Promise<void>;
  signInWithGoogle: (e?: any) => Promise<void>;
  signIn: (e?: any) => Promise<void>;
  login: (e?: any) => Promise<void>;
  logout: () => Promise<void>;
  signOutUser: () => Promise<void>;
  verifyAndBindPhone: (phoneNumber: string) => Promise<boolean>;
  isDeviceAuthorized: boolean;
  isSessionVerified: boolean;
  isAdmin: boolean;
  isMasterAdmin: boolean;
  activeChallenge: { challengeNumber: number; status: string } | null;
  approveDeviceChallenge: (selectedNumber: number) => Promise<void>;
  rejectDeviceChallenge: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState(false);
  const [isSessionVerified, setIsSessionVerified] = useState(false);

  // States for standard Google-Style 2FA prompt
  const [activeChallenge, setActiveChallenge] = useState<{ challengeNumber: number; status: string } | null>(null);
  const [laptopChallengeNumber, setLaptopChallengeNumber] = useState<number | null>(null);
  const [showLaptopPrompt, setShowLaptopPrompt] = useState(false);
  const [options, setOptions] = useState<number[]>([]);

  // Unique client coordinate hardware metric
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

  // Profile lookup: coordinates Google-Style verification prompts over Firestore
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
          deviceSignature: deviceSig, // First device gets approved as primary automatically
          isSetupComplete: false
        };
        await setDoc(userDocRef, newProfile);
        setProfile(newProfile);
        setIsDeviceAuthorized(true);
        setIsSessionVerified(false);
        toast.success("Google Account authenticated! Setup your 10-digit primary mobile.");
      } else {
        const userData = userDoc.data() as UserProfile;
        setProfile(userData);

        const isPrimaryDevice = !userData.deviceSignature || userData.deviceSignature === deviceSig;

        if (isPrimaryDevice) {
          // If accessing from the original validated device, bypass security challenges instantly!
          setIsDeviceAuthorized(true);
          if (userData.phoneVerified && userData.isSetupComplete) {
            setIsSessionVerified(true);
            toast.success(`Welcome back, ${userData.displayName}!`);
          } else {
            setIsSessionVerified(false);
          }
        } else {
          // NEW DEVICE DETECTED (e.g. Laptop accessing while phone holds primary coordinate signature)
          console.log("[AuthContext] New device detected! Preparing standard Google 2-Factor Challenge...");
          setIsDeviceAuthorized(false);
          setIsSessionVerified(false);

          // Generate a 2-digit challenge matching code (like Google's own verification model)
          const challengeCode = Math.floor(Math.random() * 89) + 10;
          setLaptopChallengeNumber(challengeCode);
          setShowLaptopPrompt(true);

          // Write this challenge directly into Firestore so the mobile app listener receives it
          await updateDoc(userDocRef, {
            pendingChallenge: {
              challengeNumber: challengeCode,
              status: "pending",
              newDeviceSignature: deviceSig,
              requestedAt: new Date().toISOString()
            }
          });
          toast.warning("Verification prompt sent to your primary registered mobile device!");
        }
      }
    } catch (err: any) {
      console.error("[AuthContext] Firestore sync failure:", err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser);
          await handleUserLogin(currentUser);

          // Start a real-time Firestore observer specifically for the logged in user profile
          const userDocRef = doc(db, 'users', currentUser.uid);
          const unsubProfile = onSnapshot(userDocRef, (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              setProfile(data as UserProfile);

              const deviceSig = getDeviceSignature();

              // A. Monitor Challenge as the Laptop (Awaiting confirmation from approved device)
              if (data.pendingChallenge && data.pendingChallenge.newDeviceSignature === deviceSig) {
                if (data.pendingChallenge.status === "approved") {
                  console.log("[AuthContext] 2FA Success! Laptop authorized via mobile confirmation.");
                  
                  // Promote this laptop browser signature to primary device coordinate
                  updateDoc(userDocRef, {
                    deviceSignature: deviceSig,
                    pendingChallenge: null
                  }).then(() => {
                    setIsDeviceAuthorized(true);
                    setIsSessionVerified(true);
                    setShowLaptopPrompt(false);
                    toast.success("Security verified successfully! Laptop linked.");
                  });
                } else if (data.pendingChallenge.status === "rejected") {
                  toast.error("Sign-in request rejected from your mobile phone.");
                  setShowLaptopPrompt(false);
                  signOut(auth);
                }
              }

              // B. Monitor Challenge as the Mobile Phone (Approved device prompted to confirm the Laptop)
              if (data.pendingChallenge && data.deviceSignature === deviceSig && data.pendingChallenge.newDeviceSignature !== deviceSig) {
                if (data.pendingChallenge.status === "pending") {
                  console.log("[AuthContext] Incoming device authorization prompt active on phone!");
                  const correctVal = data.pendingChallenge.challengeNumber;
                  
                  // Shuffle choices to build safe selection interface
                  const fake1 = ((correctVal + 17) % 90) + 10;
                  const fake2 = ((correctVal + 43) % 90) + 10;
                  const sortedOpts = [correctVal, fake1, fake2].sort(() => Math.random() - 0.5);
                  
                  setOptions(sortedOpts);
                  setActiveChallenge({
                    challengeNumber: correctVal,
                    status: "pending"
                  });
                } else {
                  setActiveChallenge(null);
                }
              } else {
                setActiveChallenge(null);
              }
            }
          });

          return () => unsubProfile();
        } else {
          setUser(null);
          setProfile(null);
          setIsDeviceAuthorized(false);
          setIsSessionVerified(false);
          setActiveChallenge(null);
          setShowLaptopPrompt(false);
        }
      } catch (err) {
        console.error("[AuthContext] Observer fail:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Secure Direct Google Popup auth execution gesture
  const executeGoogleAuth = async (e?: any) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    setLoading(true);
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    try {
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
      await handleUserLogin(result.user);
    } catch (popupErr: any) {
      console.error("[AuthContext] Google popup failed:", popupErr);
      toast.error("Popup was blocked by your browser extensions. Please allow popup.");
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = executeGoogleAuth;
  const signInWithGoogle = executeGoogleAuth;
  const signIn = executeGoogleAuth;
  const login = executeGoogleAuth;

  // Locks validated primary mobile phone
  const verifyAndBindPhone = async (phoneNumber: string): Promise<boolean> => {
    if (!user) {
      toast.error("Session expired. Please log in with Google first.");
      return false;
    }

    const sanitizedPhone = phoneNumber.trim().replace(/\D/g, '');
    if (sanitizedPhone.length !== 10) {
      toast.error("Kripya ek valid 10-digit mobile number hi enter kijiye!");
      return false;
    }

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const deviceSig = getDeviceSignature();

      await updateDoc(userDocRef, {
        phoneNumber: sanitizedPhone,
        phoneVerified: true,
        deviceSignature: deviceSig, // Bind current device signature as primary
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
      toast.success("Mobile linked and registered as primary device browser successfully!");
      return true;
    } catch (err: any) {
      console.error("[AuthContext] Phone setup failed:", err);
      toast.error(`Database Error: ${err.message || 'Verification blocked'}`);
      return false;
    }
  };

  // Approved Phone Taps Correct Match Code
  const approveDeviceChallenge = async (selectedNumber: number) => {
    if (!user || !activeChallenge) return;

    if (selectedNumber === activeChallenge.challengeNumber) {
      toast.success("Device access approved successfully!");
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        "pendingChallenge.status": "approved"
      });
      setActiveChallenge(null);
    } else {
      toast.error("Galat number selected! Request rejected for safety.");
      await rejectDeviceChallenge();
    }
  };

  // Approved Phone Denies Login Action
  const rejectDeviceChallenge = async () => {
    if (!user) return;
    const userDocRef = doc(db, 'users', user.uid);
    await updateDoc(userDocRef, {
      "pendingChallenge.status": "rejected"
    });
    setActiveChallenge(null);
  };

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      setProfile(null);
      setIsSessionVerified(false);
      setIsDeviceAuthorized(false);
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
      isSessionVerified,
      isAdmin,
      isMasterAdmin,
      activeChallenge,
      approveDeviceChallenge,
      rejectDeviceChallenge
    }}>
      {children}

      {/* LAPTOP VIEW: Google-Style 2FA Matching Code Challenge display Overlay */}
      {showLaptopPrompt && laptopChallengeNumber && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 border border-slate-100 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-4 animate-bounce">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Approve Sign-in</h3>
            <p className="text-slate-500 text-sm mt-1 mb-6">
              A verification prompt has been sent to your primary mobile phone. Tap the matching number below to approve:
            </p>
            <div className="w-24 h-24 bg-indigo-600 text-white rounded-3xl flex items-center justify-center text-5xl font-black shadow-lg shadow-indigo-600/30 tracking-tight">
              {laptopChallengeNumber}
            </div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-6 animate-pulse">
              Awaiting confirmation...
            </p>
            <button
              onClick={() => {
                setShowLaptopPrompt(false);
                signOut(auth);
              }}
              className="mt-6 text-sm text-slate-500 hover:text-slate-700 font-bold underline transition duration-150"
            >
              Cancel Request
            </button>
          </div>
        </div>
      )}

      {/* MOBILE PHONE VIEW: Floating approval notification challenge card */}
      {activeChallenge && activeChallenge.status === "pending" && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-lg">
          <div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl p-6 border border-slate-100 flex flex-col items-center text-center animate-in slide-in-from-bottom duration-300">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Sign-in Request</h3>
            <p className="text-slate-500 text-xs px-2 mt-1 mb-6">
              Is that you trying to sign in from another browser/laptop? Choose the matching code to authorize:
            </p>
            
            {/* Standard Number Match Selection Buttons */}
            <div className="grid grid-cols-3 gap-3 w-full mb-6">
              {options.map((num) => (
                <button
                  key={num}
                  onClick={() => approveDeviceChallenge(num)}
                  className="py-4 px-2 bg-slate-50 hover:bg-indigo-600 hover:text-white border-2 border-slate-200 hover:border-indigo-600 rounded-2xl text-2xl font-black text-slate-900 active:scale-95 transition-all duration-150"
                >
                  {num}
                </button>
              ))}
            </div>

            <button
              onClick={rejectDeviceChallenge}
              className="w-full py-3 px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-2xl transition duration-150"
            >
              No, It's Not Me (Block)
            </button>
          </div>
        </div>
      )}
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
