import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Home, LogIn } from 'lucide-react';
import { motion } from 'motion/react';

export function AuthScreen() {
  const { login, loading: authLoading } = useAuth();

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-gray-900">
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&q=80&w=2000" 
          alt="Omaxe Heights Luxury Building"
          className="w-full h-full object-cover opacity-50 scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-indigo-900/40 to-black/80" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 w-full max-w-md"
      >
        <Card className="bg-white/95 backdrop-blur-xl border-0 shadow-2xl rounded-[2.5rem] overflow-hidden">
          <CardHeader className="space-y-2 p-8 text-center">
            <div className="w-16 h-16 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center text-white shadow-lg mb-4">
              <Home size={32} />
            </div>
            <CardTitle className="text-3xl font-black text-gray-900 uppercase italic tracking-tighter">Omaxe Heights</CardTitle>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">Sonipat, Haryana</p>
            <CardDescription className="font-bold text-indigo-600 uppercase tracking-widest text-xs">Society's Digital Yellow Pages.</CardDescription>
          </CardHeader>

          <CardContent className="p-8 pt-0">
            <div className="space-y-6">
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex -space-x-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-indigo-100 flex items-center justify-center overflow-hidden">
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=user${i}`} alt="user" className="w-full h-full" />
                      </div>
                    ))}
                    <div className="w-10 h-10 rounded-full border-2 border-white bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">+50</div>
                  </div>
                  <p className="text-xs text-indigo-900 font-bold uppercase tracking-widest">STAY CONNECTED</p>
                </div>
              </div>

              <Button 
                className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-base sm:text-lg rounded-2xl shadow-xl shadow-indigo-100 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                onClick={login}
                disabled={authLoading}
              >
                <LogIn size={20} />
                {authLoading ? 'Verifying...' : 'Login with Google account'}
              </Button>
            </div>

            <div className="pt-8 mt-6 border-t border-gray-100 text-center">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">
                DESIGNED & DEVELOPED BY ASHWANI SIKKA
              </p>
              <p className="text-[8px] text-gray-300 mt-1 uppercase tracking-widest">
                Official Residential Portal
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
