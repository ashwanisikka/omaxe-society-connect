import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, setPersistence, browserLocalPersistence, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null; profile: UserProfile | null; loading: boolean; login: () => void; logout: () => Promise<void>;
  isDeviceAuthorized: boolean; isSessionVerified: boolean; isAdmin: boolean; isMasterAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
  const appId = 'omaxe-app-id';

  const getDeviceSignature = (): string => {
    let sig = localStorage.getItem('omaxe_device_signature');
    if (!sig) { sig = 'dev_' + Math.random().toString(36).substr(2, 9); localStorage.setItem('omaxe_device_signature', sig); }
    return sig;
  };

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence);
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const userDocRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'profile', 'user_data');
        
        // Security Check: Forced logout if device not authorized
        onSnapshot(userDocRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            const clientSig = getDeviceSignature();
            if (data.authorizedDevices && !data.authorizedDevices.includes(clientSig)) {
              signOut(auth);
              window.location.reload();
            }
          }
        });

        const snap = await getDoc(userDocRef);
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
          setIsSessionVerified(true);
        } else {
          setShowSetupWizard(true);
        }
      } else {
        setUser(null); setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(() => signInWithRedirect(auth, provider));
  };

  const logout = async () => { await signOut(auth); };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout, isDeviceAuthorized, isSessionVerified, isAdmin: profile?.role === 'admin', isMasterAdmin: user?.email === 'ashwani.sikka@gmail.com' }}>
      {children}
      {showSetupWizard && user && (
        <div className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center p-6">
          <h2 className="text-xl font-black mb-4 uppercase">Complete Registration</h2>
          <input className="w-full max-w-xs p-3 border rounded-xl mb-2" placeholder="Full Name" value={setupName} onChange={(e) => setSetupName(e.target.value)} />
          <input className="w-full max-w-xs p-3 border rounded-xl mb-4" placeholder="10-digit Phone" value={setupPhone} onChange={(e) => setSetupPhone(e.target.value.replace(/\D/g, ''))} />
          <button className="w-full max-w-xs p-4 bg-indigo-600 text-white rounded-xl font-bold" onClick={() => {
            window.location.href = `sms:+91${setupPhone}?body=${encodeURIComponent("Activate Omaxe: " + window.location.origin)}`;
            toast.success("SMS App opened!");
          }}>Send Handshake SMS</button>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext)!;
