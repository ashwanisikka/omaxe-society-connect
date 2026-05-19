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
      // Explicitly request microphone permission first as many modern browsers 
      // require a user-gesture-initiated promise for permissions in iframes
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Stop the stream immediately, this was just to trigger the permission prompt
      stream.getTracks().forEach(track => track.stop());

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        toast.error("Voice input is not supported in this browser. Please use Chrome or Edge.", { id: 'voice-error' });
        return;
      }

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      
      recognition.lang = 'en-IN'; // Regional optimization
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        toast.info("Voice Search ACTIVE: Speak now...", { 
          id: 'voice-toast', 
          duration: Infinity,
          description: "If this doesn't capture your voice, try opening the site in a new tab."
        });
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
          setSearchQuery(finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        toast.dismiss('voice-toast');

        const errorMessages: Record<string, string> = {
          'not-allowed': "Microphone access denied. Try opening the app in a new tab (click the external link icon) if permissions won't stay active in the preview.",
          'network': "Network error. Please check your connection.",
          'no-speech': "No voice detected. Please try again.",
          'aborted': "Voice search cancelled."
        };

        toast.error(errorMessages[event.error] || `Voice error: ${event.error}`, { id: 'voice-error' });
      };

      recognition.onend = () => {
        setIsListening(false);
        toast.dismiss('voice-toast');
      };

      recognition.start();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      toast.error("Could not access microphone. Please check your browser permissions.");
    }
  };

  const navigationCards = [
    { id: 'advertisement', icon: <ShoppingBag size={28} />, title: 'Classifieds & Sales', desc: 'Buy/Sell/Rent Property & Items', color: 'text-amber-500', bg: 'bg-amber-50' },
    { id: 'business', icon: <Building2 size={28} />, title: 'Business Directory', desc: 'Promote/Find Local Services', color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'professionals', icon: <Wrench size={28} />, title: 'Find Professionals', desc: 'Plumbers, Electricians, Handymen, House Help', color: 'text-orange-500', bg: 'bg-orange-50' },
    { id: 'vendors', icon: <Store size={28} />, title: 'Local Vendors', desc: 'Maids, Delivery, Daily Needs', color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { id: 'general', icon: <Bell size={28} />, title: 'Community Updates', desc: 'Events, Announcements, Discussions', color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { id: 'emergency', icon: <PhoneCall size={28} />, title: 'Emergency Contacts', desc: 'Security, Hospital numbers', color: 'text-white', bg: 'bg-red-600' },
  ];

  const handleShare = async () => {
    const shareData = {
      title: 'Society Connect',
      text: 'Join the official Residential Hub for our community!',
      url: window.location.origin,
    };

    try {
      if (navigator.share && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        toast.success('App link copied! Share it on WhatsApp.', {
          description: 'Tip: Open the link and use "Add to Home Screen" to install it as an app icon.',
          duration: 5000
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Ignore user cancellation
      }
      console.error('Error sharing:', error);
    }
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
      const matchesSearch = (
        post.title?.toLowerCase().includes(q) ||
        post.content?.toLowerCase().includes(q) ||
        post.authorName?.toLowerCase().includes(q)
      );
      const matchesCategory = activeCategory === 'all' || post.category === activeCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(0);
      const dateB = b.createdAt?.toDate?.() || new Date(0);
      return sortBy === 'newest' 
        ? dateB.getTime() - dateA.getTime() 
        : dateA.getTime() - dateB.getTime();
    });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-40 pb-12 flex-grow">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-16 px-12 py-20 bg-white rounded-[3.5rem] border border-slate-100 shadow-xl shadow-slate-200/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/40 rounded-full translate-x-32 -translate-y-32" />
          <div className="space-y-4 relative z-10">
            <div className="flex items-center gap-6">
              <Avatar className="h-20 w-20 border-4 border-white shadow-2xl rounded-3xl bg-indigo-50 shrink-0 overflow-hidden">
                <AvatarImage 
                  key={`${profile?.uid}-${profile?.gender}`}
                  src={getAvatarUrl(profile?.uid, profile?.gender)} 
                  className="object-cover" 
                />
                <AvatarFallback className="bg-indigo-600 text-white font-black text-xl">
                  <UserIcon size={32} />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tighter leading-tight font-display uppercase">
                  Society <span className="text-indigo-600 italic">Feed</span>
                </h1>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em] mt-2">Digital Community Billboard</p>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Button 
                variant="outline" 
                size="lg"
                onClick={handleShare}
                className="h-12 rounded-2xl border-slate-200 text-slate-900 font-black text-[10px] uppercase tracking-widest gap-2 hover:bg-slate-900 hover:text-white transition-all shadow-lg"
              >
                <Share2 size={16} strokeWidth={3} /> Invite Neighbors
              </Button>
            </div>
          </div>

          {isMasterAdmin && (
            <div className="flex flex-col sm:flex-row bg-slate-50 p-2 rounded-[2rem] border border-slate-100 self-start shadow-inner relative z-10">
              <Button 
                variant={view === 'approved' ? 'default' : 'ghost'} 
                onClick={() => setView('approved')}
                className={`rounded-[1.5rem] px-8 h-14 gap-3 font-black text-[10px] uppercase tracking-[0.2em] transition-all ${view === 'approved' ? 'bg-slate-900 text-white shadow-2xl' : 'text-slate-400 hover:text-indigo-600'}`}
              >
                <LayoutDashboard size={20} /> Feed
              </Button>
              <Button 
                variant={view === 'pending' ? 'default' : 'ghost'} 
                onClick={() => setView('pending')}
                className={`rounded-[1.5rem] px-8 h-14 gap-3 font-black text-[10px] uppercase tracking-[0.2em] relative transition-all ${view === 'pending' ? 'bg-amber-500 text-white shadow-2xl' : 'text-slate-400 hover:text-amber-600'}`}
              >
                <ShieldAlert size={20} /> Pending
                {posts.filter(p => p.status === 'pending').length > 0 && view !== 'pending' && (
                  <span className="absolute top-2 right-2 flex h-5 w-5 bg-red-600 rounded-full border-4 border-slate-50 items-center justify-center text-[8px] text-white font-black">
                    {posts.filter(p => p.status === 'pending').length}
                  </span>
                )}
              </Button>
              <Button 
                variant={view === 'users' ? 'default' : 'ghost'} 
                onClick={() => setView('users')}
                className={`rounded-[1.5rem] px-8 h-14 gap-3 font-black text-[10px] uppercase tracking-[0.2em] transition-all ${view === 'users' ? 'bg-indigo-600 text-white shadow-2xl' : 'text-slate-400 hover:text-indigo-600'}`}
              >
                <Users size={20} /> Residents
              </Button>
            </div>
          )}
        </header>

        {/* Welcome Banner from Reference Image */}
        <div className="text-center mb-16 space-y-3">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tighter uppercase font-display">
            Welcome, {profile?.displayName?.toUpperCase() || 'RESIDENT'}!
          </h2>
          <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.3em]">
            Official Community Dashboard
          </p>
        </div>

        {view === 'users' && isMasterAdmin ? (
          <UserList />
        ) : (
          <div className="space-y-12">
            {/* Category Grid from Reference Image */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {navigationCards.map((card) => (
                <motion.button
                  key={card.id}
                  whileHover={{ y: -5 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActiveCategory(card.id as PostCategory)}
                  className={`flex flex-col items-center justify-center p-6 rounded-[2rem] border-2 transition-all text-center min-h-[160px] relative overflow-hidden group ${
                    activeCategory === card.id 
                      ? 'border-indigo-600 bg-white ring-4 ring-indigo-50 shadow-2xl' 
                      : 'border-white bg-white shadow-lg hover:shadow-xl'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${card.bg} ${card.color} ${card.id === 'emergency' ? 'shadow-xl shadow-red-200' : ''}`}>
                    {card.icon}
                  </div>
                  <h3 className="text-[11px] font-black uppercase tracking-tight text-slate-900 leading-tight mb-1">{card.title}</h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-tight px-2">{card.desc}</p>
                  
                  {activeCategory === card.id && (
                    <motion.div 
                      layoutId="active-indicator"
                      className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600" 
                    />
                  )}
                </motion.button>
              ))}
            </div>

            {/* Post Action Button */}
            <div className="flex justify-center -mt-6">
              <Button 
                onClick={() => setIsPostModalOpen(true)}
                className="h-16 px-10 bg-[#2d5a88] hover:bg-slate-900 text-white rounded-full font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl flex items-center gap-3 border-4 border-white"
              >
                <Plus size={18} />
                Post an Ad/Requirement
              </Button>
            </div>

            <div className="pt-12 space-y-10">

              <div className="flex flex-col lg:flex-row gap-6 items-center">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
                  <Input 
                    placeholder="SEARCH RECORDS..." 
                    className="pl-16 pr-16 h-20 bg-white border-slate-100 rounded-[2rem] shadow-xl shadow-slate-200/20 text-sm font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-100 transition-all border-none"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={startListening}
                    className={`absolute right-6 top-1/2 -translate-y-1/2 rounded-full h-12 w-12 transition-all ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-300 hover:text-indigo-600 hover:bg-indigo-50'}`}
                  >
                    {isListening ? <MicOff size={24} /> : <Mic size={24} />}
                  </Button>
                </div>
                <div className="flex bg-white rounded-[2rem] border border-slate-50 p-2 shadow-xl shadow-slate-200/10 w-full lg:w-auto">
                  <Button 
                    variant={sortBy === 'newest' ? 'secondary' : 'ghost'} 
                    size="lg"
                    onClick={() => setSortBy('newest')}
                    className={`flex-1 lg:flex-none rounded-[1.5rem] h-16 px-8 text-[10px] font-black uppercase tracking-[0.3em] transition-all ${sortBy === 'newest' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-300'}`}
                  >
                    Newest
                  </Button>
                  <Button 
                    variant={sortBy === 'oldest' ? 'secondary' : 'ghost'} 
                    size="lg"
                    onClick={() => setSortBy('oldest')}
                    className={`flex-1 lg:flex-none rounded-[1.5rem] h-16 px-8 text-[10px] font-black uppercase tracking-[0.3em] transition-all ${sortBy === 'oldest' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-300'}`}
                  >
                    Oldest
                  </Button>
                </div>
              </div>

              <PostGrid posts={filteredPosts} loading={loading} />
            </div>
          </div>
        )}
      </main>

      <CreatePostModal isOpen={isPostModalOpen} onOpenChange={setIsPostModalOpen} />

      <footer className="bg-slate-900 py-12 mt-24">
        <div className="max-w-7xl mx-auto px-4 text-center">
          {isMasterAdmin && (
            <div className="inline-flex items-center gap-2 px-6 py-2 bg-indigo-600/10 border border-indigo-500/20 rounded-full mb-6 text-indigo-400 text-[10px] font-black uppercase tracking-[0.3em]">
               <Shield size={14} /> Master Admin Authority Active
            </div>
          )}
          <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-2">
            Official Resident Portal v2.0.5-SECURE
          </p>
          <p className="text-[8px] text-slate-600 uppercase tracking-widest">© 2024 All Rights Reserved</p>
        </div>
      </footer>
    </div>
  );
}

function PostGrid({ posts, loading }: { posts: Post[], loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-[400px] bg-white border border-slate-100 rounded-[2.5rem] p-8 space-y-6">
            <div className="h-6 bg-slate-50 animate-pulse rounded-full w-24" />
            <div className="space-y-3">
              <div className="h-8 bg-slate-50 animate-pulse rounded-full w-full" />
              <div className="h-8 bg-slate-50 animate-pulse rounded-full w-3/4" />
            </div>
            <div className="aspect-[16/10] bg-slate-50 animate-pulse rounded-[2rem]" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-50 animate-pulse rounded-2xl" />
              <div className="space-y-2 flex-1">
                <div className="h-3 bg-slate-50 animate-pulse rounded-full w-1/3" />
                <div className="h-2 bg-slate-50 animate-pulse rounded-full w-1/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-40 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100"
      >
        <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center text-slate-200 mb-8 border border-slate-100">
          <LayoutDashboard size={48} />
        </div>
        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter font-display">No Records Found</h3>
        <p className="text-slate-400 mt-4 max-w-xs mx-auto text-[10px] font-black uppercase tracking-[0.3em] leading-relaxed italic">The central database contains no matching records for the current filter selection.</p>
        <Button 
          variant="ghost" 
          onClick={() => window.location.reload()}
          className="mt-8 text-indigo-600 font-black uppercase tracking-[0.4em] text-[8px] hover:bg-indigo-50 px-6 h-10 rounded-full"
        >
          Refresh Feed
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {posts.map((post, idx) => (
        <motion.div
           key={post.id}
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: idx * 0.05 }}
        >
          <PostCard post={post} />
        </motion.div>
      ))}
    </div>
  );
}
