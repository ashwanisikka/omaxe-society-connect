import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  User
} from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
// Import path aapke project structure ke hisaab se update kiya gaya hai
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isDeviceAuthorized: boolean;
  isSessionVerified: boolean;
  isAdmin: boolean;
  submitMobileResponseKey: (key: string) => Promise<boolean>;
  currentChallengeKey: string | null;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileChallengeData, setMobileChallengeData] = useState<any>(null);
  const appId = 'omaxe-society-connect-v1';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const profileRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'profile', 'data');
        onSnapshot(profileRef, (docSnap) => {
          if (docSnap.exists()) setProfile(docSnap.data() as UserProfile);
        });
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const challengeRef = doc(db, 'artifacts', appId, 'public', 'data', 'challenges', user.uid);
    const unsub = onSnapshot(challengeRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.status === 'pending') {
          setMobileChallengeData(data);
        } else {
          setMobileChallengeData(null);
        }
      }
    });
    return () => unsub();
  }, [user]);

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login mein dikkat aayi:", err);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const submitMobileResponseKey = async (key: string) => {
    if (!user) return false;
    try {
      const challengeRef = doc(db, 'artifacts', appId, 'public', 'data', 'challenges', user.uid);
      await updateDoc(challengeRef, { response: key, status: 'verified' });
      return true;
    } catch (err) {
      console.error("Verification mein error:", err);
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, profile, loading, loginWithGoogle, logout, 
      isDeviceAuthorized: true, 
      isSessionVerified: !!mobileChallengeData,
      isAdmin: profile?.role === 'admin',
      submitMobileResponseKey,
      currentChallengeKey: mobileChallengeData?.key || null
    }}>
      {children}

      {mobileChallengeData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4">
          <div className="bg-white p-6 rounded-3xl w-full max-w-sm shadow-2xl">
            <h2 className="text-xl font-bold mb-2">Device Verify Karein</h2>
            <p className="text-gray-500 mb-6 text-sm">Matching key select karein:</p>
            
            <div className="grid grid-cols-3 gap-3 w-full mb-6">
              {mobileChallengeData.choices.map((codeOption: string) => (
                <button
                  key={codeOption}
                  onClick={() => submitMobileResponseKey(codeOption)}
                  className="py-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-black text-2xl rounded-2xl transition"
                >
                  {codeOption}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};
