import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Home, LogIn, Users, CheckCircle2, Phone, ArrowLeft, ShieldCheck, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Input } from './ui/input';
import { toast } from 'sonner';

export function AuthScreen() {
  const { login, loading: authLoading } = useAuth();

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-gray-900">
      {/* Premium Background Image for Omaxe Heights */}
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
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)] bg-white/95 backdrop-blur-2xl overflow-hidden rounded-[2.5rem]">
          <div className="h-40 bg-indigo-600 flex flex-col items-center justify-center relative overflow-hidden group">
            <div className="absolute inset-0 opacity-10">
               <div className="absolute -inset-[100%] bg-[radial-gradient(circle,white_1px,transparent_1px)] bg-[size:20px_20px]" />
            </div>
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-2xl relative z-10"
            >
              <Home size={28} strokeWidth={2.5} />
            </motion.div>
          </div>
          <CardHeader className="text-center pt-8 pb-4 px-4 sm:px-10">
            <CardTitle className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tighter leading-none">
              OMAXE <span className="text-indigo-600 italic">HEIGHTS</span>
            </CardTitle>
            <div className="flex flex-col items-center justify-center mt-3">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                Sonipat, Haryana
              </p>
              <p className="text-[14px] font-bold text-gray-900 uppercase tracking-widest mt-8 leading-tight">
                Society's Local Directory and Ad portal
              </p>
            </div>
          </CardHeader>

          <CardContent className="px-6 sm:px-10 pb-12 space-y-8">
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="flex flex-col items-center gap-4 p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100 text-center w-full">
                  <div className="flex -space-x-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-indigo-100 flex items-center justify-center overflow-hidden">
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=user${i}`} alt="user" className="w-full h-full" />
                      </div>
                    ))}
                    <div className="w-10 h-10 rounded-full border-2 border-white bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">
                      +50
                    </div>
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

            <div className="pt-4 border-t border-gray-100">
              <p className="text-center text-[10px] text-gray-400 leading-relaxed font-bold uppercase tracking-widest">
                Official Residential Portal
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
