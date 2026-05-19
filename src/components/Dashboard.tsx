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
        {view === 'users' && isMasterAdmin ? <UserList /> : (
          <div className="space-y-12">
            <PostGrid posts={filteredPosts} loading={loading} />
          </div>
        )}
      </main>
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
