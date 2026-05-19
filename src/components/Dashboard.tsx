import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigation } from './Navigation';
import { PostCard } from './PostCard';
import { Post, PostCategory } from '../types';
import { postService } from '../services/postService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { CreatePostModal } from './CreatePostModal';
import { Button } from './ui/button';
import { 
  ShoppingBag, 
  Building2, 
  Wrench, 
  Store, 
  Bell, 
  PhoneCall, 
  Shield,
  ShieldAlert, 
  LayoutDashboard, 
  Search, 
  Users, 
  Share2, 
  X,
  Plus,
  Mic,
  MicOff,
  User as UserIcon
} from 'lucide-react';
import { Input } from './ui/input';
import { motion, AnimatePresence } from 'motion/react';
import { UserList } from './UserList';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { getAvatarUrl } from '../lib/utils';

export function Dashboard() {
  const { isAdmin, isMasterAdmin, profile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [view, setView] = useState<'approved' | 'pending' | 'users'>('approved');
  const [activeCategory, setActiveCategory] = useState<PostCategory | 'all'>('all');
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const startListening = async () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Voice input is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = 'en-IN';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        toast.info("Voice Search ACTIVE...", { id: 'voice-toast', duration: Infinity });
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        }
        if (finalTranscript) setSearchQuery(finalTranscript);
      };

      recognition.onerror = () => { setIsListening(false); toast.dismiss('voice-toast'); };
      recognition.onend = () => { setIsListening(false); toast.dismiss('voice-toast'); };
      recognition.start();
    } catch (error) {
      toast.error("Could not access microphone.");
    }
  };

  const navigationCards = [
    { id: 'advertisement', icon: <ShoppingBag size={28} />, title: 'Classifieds & Sales', desc: 'Buy/Sell/Rent', color: 'text-amber-500', bg: 'bg-amber-50' },
    { id: 'business', icon: <Building2 size={28} />, title: 'Business Directory', desc: 'Local Services', color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'professionals', icon: <Wrench size={28} />, title: 'Find Professionals', desc: 'Handymen/Help', color: 'text-orange-500', bg: 'bg-orange-50' },
    { id: 'vendors', icon: <Store size={28} />, title: 'Local Vendors', desc: 'Daily Needs', color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { id: 'general', icon: <Bell size={28} />, title: 'Community Updates', desc: 'Events/Announcements', color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { id: 'emergency', icon: <PhoneCall size={28} />, title: 'Emergency Contacts', desc: 'Security/Hospitals', color: 'text-white', bg: 'bg-red-600' },
  ];

  const handleShare = async () => {
    const shareData = { title: 'Society Connect', text: 'Join our community hub!', url: window.location.origin };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(shareData.url); toast.success('Link copied!'); }
    } catch (error) { console.error('Share error:', error); }
  };

  useEffect(() => {
    const unsubscribe = postService.subscribeToPosts((fetchedPosts) => {
      setPosts(fetchedPosts);
      setLoading(false);
    }, (view === 'approved' || !isMasterAdmin) ? { status: 'approved' } : { status: 'pending' });
    return () => unsubscribe();
  }, [view, isMasterAdmin]);

  const filteredPosts = posts
    .filter(post => {
      const q = searchQuery.toLowerCase();
      return (post.title?.toLowerCase().includes(q) || post.content?.toLowerCase().includes(q)) && (activeCategory === 'all' || post.category === activeCategory);
    })
    .sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(0);
      const dateB = b.createdAt?.toDate?.() || new Date(0);
      return sortBy === 'newest' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
    });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 pt-40 pb-12 flex-grow">
        {/* Dashboard Content Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-16 px-12 py-20 bg-white rounded-[3.5rem] shadow-xl border border-slate-100">
           <div className="flex items-center gap-6">
              <Avatar className="h-20 w-20 rounded-3xl bg-indigo-50 shrink-0">
                <AvatarImage src={getAvatarUrl(profile?.uid, profile?.gender)} />
                <AvatarFallback><UserIcon size={32} /></AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-4xl font-black text-slate-900 uppercase">Society <span className="text-indigo-600 italic">Feed</span></h1>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em] mt-2">Digital Community Billboard</p>
              </div>
           </div>
        </header>

        {view === 'users' && isMasterAdmin ? <UserList /> : (
          <div className="space-y-12">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {navigationCards.map((card) => (
                <button key={card.id} onClick={() => setActiveCategory(card.id as PostCategory)} className="flex flex-col items-center p-6 bg-white rounded-[2rem] shadow-lg hover:shadow-xl transition-all">
                  <div className={`w-14 h-14 ${card.bg} ${card.color} rounded-2xl flex items-center justify-center mb-4`}>{card.icon}</div>
                  <h3 className="text-[11px] font-black uppercase">{card.title}</h3>
                </button>
              ))}
            </div>
            <PostGrid posts={filteredPosts} loading={loading} />
          </div>
        )}
      </main>

      {/* FOOTER UPDATED WITH BRANDING */}
      <footer className="bg-slate-900 py-12 mt-24 text-center text-white">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-2">
          Official Resident Portal v2.0.5
        </p>
        <p className="text-[10px] font-bold tracking-[0.2em] text-indigo-400">
          DESIGNED & DEVELOPED BY <span className="text-white font-black underline decoration-indigo-500">ASHWANI SIKKA</span>
        </p>
        <p className="text-[8px] text-slate-600 uppercase tracking-widest mt-4">© 2026 All Rights Reserved</p>
      </footer>
    </div>
  );
}

function PostGrid({ posts, loading }: { posts: Post[], loading: boolean }) {
  if (loading) return <div className="text-center p-20">Loading Posts...</div>;
  if (posts.length === 0) return <div className="text-center p-20 text-slate-400 font-bold">No Records Found</div>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {posts.map((post) => <PostCard key={post.id} post={post} />)}
    </div>
  );
}
