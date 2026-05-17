import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { LogOut, Home, Shield, Building2 } from 'lucide-react';
import { getAvatarUrl } from '../lib/utils';

export function Navigation() {
  const { profile, logout, isAdmin, isMasterAdmin } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-2xl border-b border-slate-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="flex justify-between h-20 items-center">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg overflow-hidden">
               <Building2 size={24} />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black text-slate-900 tracking-tighter leading-none uppercase font-display">Resident <span className="text-indigo-600">Portal</span></span>
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.4em] mt-1 italic">Verified System Access</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {isMasterAdmin ? (
              <div className="hidden lg:flex items-center gap-2 px-4 py-1.5 bg-red-600 text-white rounded-full font-black text-[9px] uppercase tracking-[0.2em] shadow-lg shadow-red-100">
                <Shield size={12} className="animate-pulse" /> Master Admin
              </div>
            ) : isAdmin ? (
              <div className="hidden lg:flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-white rounded-full font-black text-[9px] uppercase tracking-[0.2em] shadow-lg shadow-slate-200">
                <Shield size={12} /> Administrator
              </div>
            ) : null}

            <div className="flex items-center gap-4 border-l border-slate-100 pl-6">
              <div className="hidden md:flex flex-col text-right">
                <p className="text-xs font-black text-indigo-600 leading-none uppercase tracking-widest mb-1">Welcome,</p>
                <p className="text-sm font-black text-slate-900 leading-none uppercase tracking-tight">{profile?.displayName?.toUpperCase()}</p>
              </div>
              <Avatar className="h-11 w-11 border-4 border-white shadow-xl rounded-2xl bg-indigo-50">
                <AvatarImage 
                  src={getAvatarUrl(profile?.uid, profile?.gender)} 
                  className="object-cover" 
                />
                <AvatarFallback className="bg-indigo-600 text-white font-black text-sm">{profile?.displayName?.charAt(0)}</AvatarFallback>
              </Avatar>
            </div>
            
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={logout}
              className="h-11 w-11 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all active:scale-90"
            >
              <LogOut size={22} />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
