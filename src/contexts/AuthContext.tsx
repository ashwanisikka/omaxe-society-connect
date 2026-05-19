import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, setPersistence, browserLocalPersistence, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null; profile: UserProfile | null; loading: boolean; loginWithGoogle: (e?: any) => void; signInWithGoogle: (e?: any) => void; signIn: (e?: any) => void; login: (e?: any) => void; logout: () => Promise<void>; signOutUser: () => Promise<void>; verifyAndBindPhone: (phoneNumber?: any, fullName?: string, gender?: string) => Promise<boolean>; isDeviceAuthorized: boolean; isSessionVerified: boolean; isAdmin: boolean; isMasterAdmin: boolean; submitMobileResponseKey: (key: string) => Promise<boolean>; currentChallengeKey: string | null; resetPhoneRegistration: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState(true);
  const [isSessionVerified, setIsSessionVerified] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [setupStep, setSetupStep] = useState(1); 
  const [setupName, setSetupName] = useState('');
  const [setupPhone, setSetupPhone] = useState('');
  const [setupGender, setSetupGender] = useState('');
  const [setupSubmitLoading, setSetupSubmitLoading] = useState(false);
  const [showDevToolkit, setShowDevToolkit] = useState(false);
  const setupNameRef = useRef(setupName);
  const setupGenderRef = useRef(setupGender);
  const setupPhoneRef = useRef(setupPhone);

  useEffect(() => { setupNameRef.current = setupName; }, [setupName]);
  useEffect(() => { setupGenderRef.current = setupGender; }, [setupGender]);
  useEffect(() => { setupPhoneRef.current = setupPhone; }, [setupPhone]);

  const [showLaptopHandshake, setShowLaptopHandshake] = useState(false);
  const [laptopHandshakeCode, setLaptopHandshakeCode] = useState('');
  const [mobileChallengeData, setMobileChallengeData] = useState<{ challengeCode: string; choices: string[]; status: string; } | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'default-app-id';

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault(); setDeferredPrompt(e); setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    if (isStandalone) setShowInstallBanner(false);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] User response to installation choice: ${outcome}`);
    setDeferredPrompt(null); setShowInstallBanner(false);
  };

  const getDeviceSignature = (): string => {
    let signature = localStorage.getItem('omaxe_device_signature');
    if (!signature) {
      const screenParams = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
      const agentParams = navigator.userAgent.replace(/\D/g, '');
      const uniqueUUID = generateUUID();
      signature = `dev_${btoa(screenParams + agentParams).slice(0, 16)}_${uniqueUUID.slice(0, 8)}`;
      localStorage.setItem('omaxe_device_signature', signature);
    }
    return signature;
  };

  const handleUserLogin = async (currentUser: User) => {
    try {
      const userDocRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'profile', 'user_data');
      const userDoc = await getDoc(userDocRef);
      const isDesktopClient = window.innerWidth >= 768 && !/Mobi|Android|iPhone/i.test(navigator.userAgent);
      const clientSig = getDeviceSignature();

      if (!userDoc.exists()) {
        const tempProfile: UserProfile = { uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '', role: 'user' as UserRole, createdAt: new Date().toISOString(), phoneVerified: false, phoneNumber: '', deviceSignature: clientSig, isSetupComplete: false };
        setProfile(tempProfile); setIsSessionVerified(false); setIsDeviceAuthorized(true); setShowSetupWizard(true); setSetupStep(prev => (prev === 2 || prev === 3) ? prev : 1); setSetupName(currentUser.displayName || '');
      } else {
        const userData = userDoc.data() as UserProfile;
        setProfile(userData); setIsDeviceAuthorized(true);

        if (userData.phoneVerified && userData.isSetupComplete) {
          const authorizedList = userData.authorizedDevices || [];
          const isCurrentSessionAuthorized = userData.deviceSignature === clientSig || authorizedList.includes(clientSig);
          if (isCurrentSessionAuthorized) {
            setIsSessionVerified(true); setShowSetupWizard(false); setShowLaptopHandshake(false); toast.success(`Welcome back, ${userData.displayName || 'Resident'}!`);
          } else {
            if (isDesktopClient) {
              setIsSessionVerified(true); setShowSetupWizard(false);
              const targetNum = (Math.floor(Math.random() * 90) + 10).toString();
              const decoy1 = (Math.floor(Math.random() * 90) + 10).toString();
              const decoy2 = (Math.floor(Math.random() * 90) + 10).toString();
              const choicesArray = [targetNum, decoy1, decoy2].sort(() => Math.random() - 0.5);
              setLaptopHandshakeCode(targetNum); setShowLaptopHandshake(true);
              const challengeRef = doc(db, 'artifacts', appId, 'public', 'data', 'challenges', currentUser.uid);
              await setDoc(challengeRef, { challengeCode: targetNum, choices: choicesArray, status: 'pending', targetDeviceSig: clientSig, createdAt: new Date().toISOString() });
              toast.warning("Verification handshake dispatched to your physical mobile phone.");
            } else {
              setIsSessionVerified(true); setShowSetupWizard(false); setShowLaptopHandshake(false);
            }
          }
        } else {
          setIsSessionVerified(false); setShowSetupWizard(true); setSetupStep(prev => (prev === 2 || prev === 3) ? prev : 1);
          setSetupName(userData.displayName || currentUser.displayName || ''); setSetupPhone(userData.phoneNumber || ''); setSetupGender(userData.gender || '');
        }
      }
    } catch (err: any) {
      const localProfileStr = localStorage.getItem(`omaxe_user_profile_${currentUser.uid}`);
      if (localProfileStr) {
        try { const localProfile = JSON.parse(localProfileStr) as UserProfile; setProfile(localProfile); setIsDeviceAuthorized(true); setIsSessionVerified(true); setShowSetupWizard(false); } catch (e) { console.error(e); }
      } else {
        const fallbackProfile: UserProfile = { uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || '', role: 'user' as UserRole, createdAt: new Date().toISOString(), phoneVerified: false, phoneNumber: '', deviceSignature: 'local_bypass', isSetupComplete: false };
        setProfile(fallbackProfile); setIsDeviceAuthorized(true); setIsSessionVerified(false); setShowSetupWizard(true); setSetupStep(prev => (prev === 2 || prev === 3) ? prev : 1); setSetupName(currentUser.displayName || '');
      }
    }
  };

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch((err) => console.warn(err));
    getRedirectResult(auth).then(async (result) => { if (result && result.user) { setUser(result.user); await handleUserLogin(result.user); } }).catch((err) => console.warn(err));

    const handleUrlActivation = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const verifySimUid = urlParams.get('verify_sim');
      if (verifySimUid) {
        try {
          const cleanUrl = new URL(window.location.href); cleanUrl.searchParams.delete('verify_sim'); window.history.replaceState({}, document.title, cleanUrl.toString());
          const verificationRef = doc(db, 'artifacts', appId, 'public', 'data', 'verifications', verifySimUid);
          await setDoc(verificationRef, { status: 'verified' }, { merge: true });
          toast.success("Identity profile verified successfully via SIM Handshake Link.");
        } catch (e: any) { console.error(e.message); }
      }
    };
    handleUrlActivation();
  }, [appId]);

  useEffect(() => {
    let unsubChallenge: () => void = () => {};
    let unsubVerification: () => void = () => {};
    let unsubProfileDeleteWatcher: () => void = () => {};

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser); await handleUserLogin(currentUser);
          const clientSig = getDeviceSignature();
          const challengeRef = doc(db, 'artifacts', appId, 'public', 'data', 'challenges', currentUser.uid);
          const verificationRef = doc(db, 'artifacts', appId, 'public', 'data', 'verifications', currentUser.uid);
          const userDocRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'profile', 'user_data');
          
          unsubProfileDeleteWatcher = onSnapshot(userDocRef, async (profileSnap) => {
            if (!profileSnap.exists()) {
              const hasLocalProfile = localStorage.getItem(`omaxe_user_profile_${currentUser.uid}`);
              if (hasLocalProfile) {
                localStorage.removeItem(`omaxe_user_profile_${currentUser.uid}`); await signOut(auth); setUser(null); setProfile(null); setIsSessionVerified(false); setShowSetupWizard(false); setShowLaptopHandshake(false); toast.error("Your resident profile has been deleted by the Admin.");
              }
            } else { setProfile(profileSnap.data() as UserProfile); }
          });

          unsubChallenge = onSnapshot(challengeRef, async (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              if (data.targetDeviceSig === clientSig) {
                if (data.status === 'approved') {
                  const userDoc = await getDoc(userDocRef);
                  if (userDoc.exists()) { const profileData = userDoc.data(); await updateDoc(userDocRef, { authorizedDevices: [...(profileData.authorizedDevices || []), clientSig] }); }
                  setIsSessionVerified(true); setShowLaptopHandshake(false); toast.success("Identity handshake matched! Laptop authorized.");
                } else if (data.status === 'rejected') {
                  toast.error("Laptop sign-in rejected."); setShowLaptopHandshake(false); signOut(auth);
                }
              }
              if (data.status === 'pending' && data.targetDeviceSig !== clientSig) setMobileChallengeData({ challengeCode: data.challengeCode, choices: data.choices || [], status: data.status });
              else setMobileChallengeData(null);
            } else { setMobileChallengeData(null); }
          });

          unsubVerification = onSnapshot(verificationRef, async (snapshot) => {
            if (snapshot.exists() && snapshot.data().status === 'verified') {
              const data = snapshot.data();
              const updatedProfile: UserProfile = { uid: currentUser.uid, email: currentUser.email || '', displayName: setupNameRef.current.trim() || currentUser.displayName || 'Resident', gender: setupGenderRef.current || 'Not Specified', role: profile?.role || 'user' as UserRole, createdAt: profile?.createdAt || new Date().toISOString(), phoneVerified: true, phoneNumber: data.phone || setupPhoneRef.current, deviceSignature: clientSig, isSetupComplete: true, authorizedDevices: [clientSig] };
              localStorage.setItem(`omaxe_user_profile_${currentUser.uid}`, JSON.stringify(updatedProfile));
              await setDoc(userDocRef, updatedProfile, { merge: true });
              setProfile(updatedProfile); setIsSessionVerified(true); setShowSetupWizard(false); toast.success("SIM Ownership validation confirmed!");
            }
          });

          return () => { unsubProfileDeleteWatcher(); unsubChallenge(); unsubVerification(); };
        } else {
          setUser(null); setProfile(null); setIsSessionVerified(false); setIsDeviceAuthorized(true); setShowSetupWizard(false); setShowLaptopHandshake(false); setMobileChallengeData(null);
        }
      } catch (err) { console.error(err); } finally { setLoading(false); }
    });
    return () => unsubscribe();
  }, [appId]);

  const executeGoogleAuth = (e?: any) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    setLoading(true);
    const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
    signInWithPopup(auth, provider).then(async (result) => { setUser(result.user); await handleUserLogin(result.user); })
      .catch((popupErr: any) => {
        if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/cancelled-popup-request') signInWithRedirect(auth, provider).catch(() => setLoading(false));
        else { toast.error("Google authentication failed."); setLoading(false); }
      });
  };

  const loginWithGoogle = executeGoogleAuth; const signInWithGoogle = executeGoogleAuth; const signIn = executeGoogleAuth; const login = executeGoogleAuth;

  const initiateSimLoopbackHandshake = async () => {
    if (!user) return;
    const finalPhone = setupPhone.trim().replace(/\D/g, '');
    if (finalPhone.length !== 10 || !/^[6-9]/.test(finalPhone)) { toast.error("Error: Kripya ek valid 10-digit mobile number enter kijiye!"); return; }
    setSetupSubmitLoading(true);
    try {
      const verificationRef = doc(db, 'artifacts', appId, 'public', 'data', 'verifications', user.uid);
      await setDoc(verificationRef, { phone: finalPhone, status: 'pending', createdAt: new Date().toISOString() });
      const activationUrl = `${window.location.origin}/?verify_sim=${user.uid}`;
      const message = `Activate Omaxe Heights account: ${activationUrl}`;
      const smsUri = `sms:+91${finalPhone}?body=${encodeURIComponent(message)}`;
      window.location.href = smsUri;
      setSetupStep(3); toast.success("SMS App khul gaya hai, bas Send button dabaiye!");
    } catch (e: any) { toast.error(`SIM configuration error: ${e.message}`); } 
    finally { setSetupStep(3); setSetupSubmitLoading(false); }
  };

  const verifyAndBindPhone = async (): Promise<{ safe: boolean }> => { return { safe: true } as any; };

  const handleMobileVerificationTap = async (selectedCode: string) => {
    if (!user || !mobileChallengeData) return;
    try {
      const challengeRef = doc(db, 'artifacts', appId, 'public', 'data', 'challenges', user.uid);
      if (selectedCode === mobileChallengeData.challengeCode) { toast.success("Matching digit confirmed! Unlocking..."); await updateDoc(challengeRef, { status: 'approved' }); }
      else { toast.error("Incorrect code! Block active."); await updateDoc(challengeRef, { status: 'rejected' }); }
    } catch (e: any) { console.error(e.message); }
  };

  const resetPhoneRegistration = async () => {
    if (!user) return;
    localStorage.removeItem(`omaxe_user_profile_${user.uid}`);
    try {
      const userDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'user_data');
      await setDoc(userDocRef, { isSetupComplete: false, phoneVerified: false }, { merge: true });
    } catch (e) { console.warn(e); }
    setIsSessionVerified(false); setShowSetupWizard(true); setSetupStep(1);
  };

  const logout = async () => {
    setLoading(true);
    try { await signOut(auth); setUser(null); setProfile(null); setIsSessionVerified(false); setShowSetupWizard(false); setShowLaptopHandshake(false); } 
    catch (err) { console.error(err); } finally { setLoading(false); }
  };
  const signOutUser = logout;

  const devResetProfileInDatabase = async () => {
    if (!user) { toast.error("Please login with a Google account first to reset it!"); return; }
    setLoading(true);
    try {
      const userDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'user_data');
      await setDoc(userDocRef, { isSetupComplete: false, phoneVerified: false, phoneNumber: "", displayName: "" }, { merge: true });
      const challengeRef = doc(db, 'artifacts', appId, 'public', 'data', 'challenges', user.uid);
      await setDoc(challengeRef, { status: 'inactive' }, { merge: true });
    } catch (err: any) { console.warn(err.message); } 
    finally { localStorage.removeItem(`omaxe_user_profile_${user.uid}`); setProfile(null); setIsSessionVerified(false); setShowSetupWizard(true); setSetupStep(1); setSetupName(''); setSetupPhone(''); setSetupGender(''); toast.success("Reset Complete!"); setLoading(false); }
  };

  const devWipeDeviceSignature = () => { localStorage.removeItem('omaxe_device_signature'); toast.success("Signature wiped!"); window.location.reload(); };

  const devSimulateAdminDeletion = async () => {
    if (!user) return;
    try { const userDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'user_data'); await setDoc(userDocRef, { isSetupComplete: false, phoneVerified: false }, { merge: true }); } 
    catch (err: any) { console.warn(err.message); } 
    finally { localStorage.removeItem(`omaxe_user_profile_${user.uid}`); setProfile(null); setIsSessionVerified(false); setShowSetupWizard(true); setSetupStep(1); toast.success("Admin deletion simulated!"); }
  };

  const submitMobileResponseKey = async () => true; const currentChallengeKey = null;
  const lastTwoDigitsOfPhone = profile?.phoneNumber ? profile.phoneNumber.slice(-2) : 'XX';
  const isDesktop = window.innerWidth >= 768 && !/Mobi|Android|iPhone/i.test(navigator.userAgent);
  const isMasterAdmin = user?.email?.toLowerCase() === 'ashwani.sikka@gmail.com';
  const isAdmin = profile?.role === 'admin' || isMasterAdmin;

  return (
    <AuthContext.Provider value={{ user, profile, loading, loginWithGoogle, signInWithGoogle, signIn, login, logout, signOutUser, verifyAndBindPhone, isDeviceAuthorized, isSessionVerified, isAdmin, isMasterAdmin, submitMobileResponseKey, currentChallengeKey, resetPhoneRegistration }}>
      {children}
      {showInstallBanner && (
        <div className="fixed top-4 left-4 right-4 z-[2000000] flex items-center justify-between bg-slate-900 text-white p-4 rounded-[1.8rem] shadow-2xl border-2 border-indigo-500/30">
          <div className="flex items-center gap-3"><span className="text-2xl">📲</span><div className="text-left"><p className="text-xs font-black uppercase tracking-wider text-indigo-400">Install Omaxe Heights App</p><p className="text-[10px] text-slate-300 font-semibold leading-tight">Install this web app to your home screen.</p></div></div>
          <div className="flex items-center gap-2 shrink-0 ml-4"><button onClick={handleInstallApp} className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-[10px] font-black uppercase px-4 py-2 rounded-xl">Install App</button><button onClick={() => setShowInstallBanner(false)} className="text-slate-400 hover:text-white p-1 text-xs font-bold">✕</button></div>
        </div>
      )}

      {isMasterAdmin && (
        <div className="fixed bottom-6 right-6 z-[999999] flex flex-col items-end">
          {!showDevToolkit ? (
            <button onClick={() => setShowDevToolkit(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-5 py-3.5 rounded-full shadow-2xl border-2 border-white flex items-center gap-2">⚙️ DEV TOOLKIT</button>
          ) : (
            <div className="w-80 bg-slate-900 border-2 border-indigo-500 text-white rounded-[2rem] p-5 shadow-2xl flex flex-col">
              <div className="flex justify-between items-center mb-4"><span className="text-xs font-black text-indigo-400 tracking-wider uppercase">🛡️ Test Toolkit</span><button onClick={() => setShowDevToolkit(false)} className="text-slate-400 hover:text-white text-sm font-bold">✕ Close</button></div>
              <div className="space-y-2.5">
                <button onClick={devResetProfileInDatabase} className="w-full text-left py-2.5 px-4 bg-indigo-950/50 hover:bg-indigo-950 text-indigo-300 hover:text-indigo-200 text-xs font-black rounded-2xl border border-indigo-800/40">🔥 Reset Setup Wizard</button>
                <button onClick={devWipeDeviceSignature} className="w-full text-left py-2.5 px-4 bg-indigo-950/50 hover:bg-indigo-950 text-indigo-300 hover:text-indigo-200 text-xs font-black rounded-2xl border border-indigo-800/40">💻 Wipe Signature</button>
              </div>
            </div>
          )}
        </div>
      )}

      {showSetupWizard && user && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100 flex flex-col my-8">
            <div className="flex flex-col items-center text-center mb-6"><span className="text-xs font-black text-indigo-600 tracking-test uppercase mb-2">Identity Activation</span><h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Resident Registration</h2><div className="h-1 w-16 bg-indigo-600 rounded-full mt-3"></div></div>
            {isDesktop ? (
              <div className="space-y-6 text-center">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Mobile SIM Proof Required</h3>
                <p className="text-slate-500 text-sm leading-relaxed px-2">Resident registration laptop par allow nahi hai. Please use mobile.</p>
                <button type="button" onClick={logout} className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl text-xs uppercase tracking-widest">Cancel & Sign Out</button>
              </div>
            ) : (
              <div className="space-y-5">
                {setupStep === 1 && (
                  <div className="space-y-5">
                    <div><label className="block text-xs font-black text-slate-500 uppercase mb-2">Full Name</label><input type="text" value={setupName} onChange={(e) => setSetupName(e.target.value)} placeholder="Full name" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold" /></div>
                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase mb-2">Gender</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={() => setSetupGender('Male')} className={`py-3 px-4 rounded-2xl border-2 font-black text-sm ${setupGender === 'Male' ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-100 bg-slate-50/50 text-slate-500'}`}>Male</button>
                        <button type="button" onClick={() => setSetupGender('Female')} className={`py-3 px-4 rounded-2xl border-2 font-black text-sm ${setupGender === 'Female' ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-100 bg-slate-50/50 text-slate-500'}`}>Female</button>
                      </div>
                    </div>
                    <div className="pt-4"><button type="button" onClick={() => { if (!setupName.trim() || !setupGender) return toast.error("Please fill all fields!"); setSetupStep(2); }} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl text-xs uppercase">Proceed</button></div>
                  </div>
                )}
                {setupStep === 2 && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase mb-2">10-Digit Mobile Number</label>
                      <input type="tel" maxLength={10} value={setupPhone} onChange={(e) => setSetupPhone(e.target.value.replace(/\D/g, ''))} placeholder="Mobile number" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-lg font-black tracking-widest" />
                    </div>
                    <div className="pt-4 grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => setSetupStep(1)} className="py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-2xl text-xs uppercase">Back</button>
                      <button type="button" onClick={initiateSimLoopbackHandshake} disabled={setupSubmitLoading} className="py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl text-xs uppercase">Verify SIM 🛡️</button>
                    </div>
                  </div>
                )}
                {setupStep === 3 && (
                  <div className="space-y-6 text-center">
                    <h3 className="text-xl font-black text-slate-900 uppercase">SMS Dispatched</h3>
                    <p className="text-slate-500 font-bold text-xs">Please send the generated SMS and click the link in your inbox.</p>
                    <div className="flex flex-col gap-3 pt-2">
                      <button type="button" onClick={initiateSimLoopbackHandshake} className="text-xs text-indigo-500 font-extrabold underline">Resend SMS</button>
                      <button type="button" onClick={() => setSetupStep(2)} className="text-xs text-slate-400 font-bold">Change Number</button>
                    </div>
                  </div>
                )}
                <div className="pt-4 border-t border-slate-100 mt-6 text-center"><button type="button" onClick={logout} className="py-2.5 text-slate-400 font-black rounded-xl text-[10px] uppercase tracking-widest">Sign Out</button></div>
              </div>
            )}
          </div>
        </div>
      )}

      {showLaptopHandshake && user && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-950/98 backdrop-blur-md overflow-hidden">
          <div className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100 flex flex-col items-center text-center">
            <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Is that you trying to sign in?</h3>
            <p className="text-slate-500 text-sm mt-1 px-4 leading-relaxed">Match code sent to phone ending in ...{lastTwoDigitsOfPhone}</p>
            <div className="w-full max-w-xs bg-slate-950 text-slate-200 rounded-[2.5rem] p-6 my-6 border border-slate-800 flex flex-col items-center"><div className="text-5xl font-black text-white tracking-widest">{laptopHandshakeCode}</div></div>
            <button type="button" onClick={logout} className="w-full py-3.5 bg-slate-100 text-slate-600 font-bold rounded-2xl text-sm uppercase">Cancel Sign In</button>
          </div>
        </div>
      )}

      {mobileChallengeData && user && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-lg">
          <div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl p-6 border border-slate-100 flex flex-col items-center text-center">
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Laptop Sign-In</h3>
            <div className="grid grid-cols-3 gap-3 w-full mb-6">
              {mobileChallengeData.choices.map((codeOption) => (
                <button key={codeOption} onClick={() => handleMobileVerificationTap(codeOption)} className="py-4 bg-indigo-50 text-indigo-600 font-black text-2xl rounded-2xl">{codeOption}</button>
              ))}
            </div>
            <button onClick={async () => { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'challenges', user.uid), { status: 'rejected' }); }} className="w-full py-3 px-4 bg-rose-50 text-rose-600 font-bold rounded-2xl text-xs uppercase">Block Access</button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
