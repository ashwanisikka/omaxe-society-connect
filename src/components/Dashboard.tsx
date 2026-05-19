import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'sonner';
import { Navigation } from './Navigation';

export function Dashboard() {
  const { profile, isMasterAdmin } = useAuth();

  const handleRevokeAccess = async (uid: string) => {
    try {
      const userDocRef = doc(db, 'artifacts', 'omaxe-app-id', 'users', uid, 'profile', 'user_data');
      await updateDoc(userDocRef, { authorizedDevices: [] });
      toast.success("Session deleted. User will be logged out on next refresh.");
    } catch (e) {
      toast.error("Failed to revoke.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 pt-40 pb-12 flex-grow">
        <h1 className="text-4xl font-black">Welcome, {profile?.displayName}</h1>
        {/* Yahan aapka feed content rahega */}
      </main>

      <footer className="bg-slate-900 py-12 mt-24 text-center text-white">
        <p className="text-[10px] font-bold tracking-[0.2em] text-indigo-400">
          DESIGNED & DEVELOPED BY <span className="text-white font-black underline">ASHWANI SIKKA</span>
        </p>
      </footer>
    </div>
  );
}
