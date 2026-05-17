import React, { useEffect, useState } from 'react';
import { UserProfile } from '../types';
import { userService } from '../services/userService';
import { motion } from 'motion/react';
import { Mail, Phone, Shield, User, Clock, Trash2, Ban, ShieldCheck, ShieldAlert, LogOut, Sparkles } from 'lucide-react';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { getAvatarUrl } from '../lib/utils';

export function UserList() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const { isMasterAdmin } = useAuth();
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = userService.subscribeToUsers((fetchedUsers) => {
      // Ensure unique users by email to address redundancy concerns
      const uniqueUsers = Array.from(new Map(fetchedUsers.map(u => [u.email, u])).values());
      setUsers(uniqueUsers);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleDeleteUser = async (userId: string, email: string) => {
    if (email === 'ashwani.sikka@gmail.com') {
      toast.error("You cannot delete the Master Admin account.");
      return;
    }
    if (!confirm('Are you sure you want to delete this resident identity? This will remove all their access permanently.')) return;

    setProcessingId(userId);
    try {
      await userService.deleteUser(userId);
      toast.success('Resident profile deleted successfully');
    } catch (error: any) {
      console.error("Delete user error:", error);
      toast.error('Failed to delete resident profile', {
        description: error.message || 'Check your permissions or internet connection.'
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleToggleBlock = async (user: UserProfile) => {
    if (user.email === 'ashwani.sikka@gmail.com') return;

    setProcessingId(user.uid);
    try {
      await userService.toggleBlockUser(user.uid, !user.isBlocked);
      toast.success(user.isBlocked ? 'Resident unblocked' : 'Resident blocked from portal');
    } catch (error) {
      toast.error('Failed to update status');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-xl shadow-slate-200/50 bg-white rounded-[2rem] p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-125 transition-transform" />
          <div className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mb-3 relative z-10">Resident Base</div>
          <div className="text-5xl font-black text-slate-900 tracking-tighter relative z-10">{users.length}</div>
        </Card>
        <Card className="border-none shadow-xl shadow-slate-200/50 bg-white rounded-[2rem] p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50/50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-125 transition-transform" />
          <div className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mb-3 relative z-10">Authority Board</div>
          <div className="text-5xl font-black text-amber-600 tracking-tighter relative z-10">{users.filter(u => u.role === 'admin').length}</div>
        </Card>
        <Card className="border-none shadow-xl shadow-slate-200/50 bg-white rounded-[2rem] p-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/50 rounded-full translate-x-8 -translate-y-8 group-hover:scale-125 transition-transform" />
          <div className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mb-3 relative z-10">New Arrivals</div>
          <div className="text-5xl font-black text-emerald-600 tracking-tighter relative z-10">
            {users.filter(u => {
              if (!u.createdAt?.toDate) return true;
              const date = u.createdAt.toDate();
              const weekAgo = new Date();
              weekAgo.setDate(weekAgo.getDate() - 7);
              return date > weekAgo;
            }).length}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between px-4">
          <div className="flex flex-col">
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase font-display">Resident Directory</h2>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] mt-1 italic">Verified Identity Management</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">LIVE BOARD</span>
          </div>
        </div>
        
        <div className="grid gap-4">
          {users.map((user, idx) => (
          <motion.div
            key={user.uid}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
          >
            <Card className="border border-slate-100 shadow-xl shadow-slate-200/20 hover:shadow-2xl hover:border-indigo-100 transition-all duration-500 rounded-[2rem] overflow-hidden bg-white group">
              <CardContent className="p-8">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                  <div className="flex items-center gap-6">
                    <Avatar className="h-16 w-16 border-4 border-white shadow-xl rounded-2xl bg-slate-100 flex-shrink-0">
                      <AvatarImage 
                        src={getAvatarUrl(user.uid, user.gender)} 
                        className="object-cover" 
                      />
                      <AvatarFallback className="bg-indigo-600 text-white font-black text-lg">{user.displayName?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                         <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg">{user.displayName || 'Unnamed Resident'}</h3>
                         <Badge variant="outline" className="text-[9px] font-black py-0.5 px-3 border-slate-100 bg-slate-50 text-slate-500 uppercase tracking-widest rounded-full">
                           {user.username || 'QUEUED'}
                         </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2">
                        {user.email && (
                          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            <Mail size={12} className="text-indigo-400" />
                            {user.email}
                          </div>
                        )}
                        {user.phoneNumber && (
                          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            <Phone size={12} className="text-indigo-400" />
                            {user.phoneNumber}
                          </div>
                        )}
                        {user.gender && (
                          <Badge variant="secondary" className="text-[9px] font-black bg-slate-100 text-slate-500 uppercase tracking-widest px-3">
                            {user.gender}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex flex-col items-end gap-1 px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] font-black text-slate-400">
                         <Clock size={10} /> Registered
                      </div>
                      <span className="text-xs font-black text-slate-900 uppercase">
                        {user.createdAt?.toDate ? format(user.createdAt.toDate(), 'MMM d, yyyy') : 'PENDING'}
                      </span>
                    </div>
                    
                    <Badge className={`px-5 py-2 rounded-2xl font-black text-[10px] tracking-widest border-none shadow-lg ${
                      user.role === 'admin' 
                        ? 'bg-amber-500 text-white shadow-amber-100' 
                        : 'bg-indigo-600 text-white shadow-indigo-100'
                    }`}>
                      <Shield size={12} className="mr-2" />
                      {user.role.toUpperCase()}
                    </Badge>

                    {isMasterAdmin && user.email !== 'ashwani.sikka@gmail.com' && (
                      <div className="flex items-center gap-3 border-l border-slate-100 pl-6">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={processingId === user.uid}
                          onClick={() => handleToggleBlock(user)}
                          className={`h-11 px-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all shadow-sm ${
                            user.isBlocked 
                              ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white' 
                              : 'bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white'
                          }`}
                        >
                          {user.isBlocked ? <ShieldCheck size={14} className="mr-2" /> : <Ban size={14} className="mr-2" />}
                          {user.isBlocked ? 'Authorize' : 'Restrict'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={processingId === user.uid}
                          onClick={() => handleDeleteUser(user.uid, user.email)}
                          className="h-11 w-11 p-0 rounded-2xl bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm"
                        >
                          <Trash2 size={18} />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                {user.isBlocked && (
                  <div className="mt-6 px-6 py-3 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 animate-pulse">
                    <Ban size={14} className="text-red-500" />
                    <span className="text-[10px] font-black uppercase text-red-600 tracking-[0.2em]">Security Protocol: Resident access strictly revoked</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
