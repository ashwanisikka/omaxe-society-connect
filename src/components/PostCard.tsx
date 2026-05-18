import React from 'react';
import { Post } from '../types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';
import { postService } from '../services/postService';
import { formatDistanceToNow } from 'date-fns';
import { Check, X, Trash2, User, Clock, Tag, MessageCircle, Maximize2, Shield, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { CommentSection } from './CommentSection';
import { motion, AnimatePresence } from 'motion/react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { getAvatarUrl } from '../lib/utils';

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  const { isAdmin, isMasterAdmin, profile } = useAuth();
  const [showComments, setShowComments] = React.useState(false);
  const isAuthor = profile?.uid === post.authorId;

  const categoryLabels: Record<string, { label: string, color: string }> = {
    household: { label: 'Household', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    advertisement: { label: 'Ad', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    general: { label: 'General', color: 'bg-green-100 text-green-700 border-green-200' },
    'lost-found': { label: 'Lost & Found', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    business: { label: 'Business', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    professionals: { label: 'Professional', color: 'bg-sky-100 text-sky-700 border-sky-200' },
    vendors: { label: 'Vendor', color: 'bg-teal-100 text-teal-700 border-teal-200' },
    emergency: { label: 'Emergency', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  };

  const statusLabels: Record<string, { label: string, color: string }> = {
    pending: { label: 'Pending Approval', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-200' },
  };

  // SAFEGUARD FALLBACKS: Stops 'Cannot read properties of undefined' crashes permanently
  const cat = categoryLabels[post.category] || { 
    label: post.category || 'General', 
    color: 'bg-gray-100 text-gray-700 border-gray-200' 
  };
  
  const stat = statusLabels[post.status || 'pending'] || { 
    label: 'Pending', 
    color: 'bg-gray-100 text-gray-700 border-gray-200' 
  };

  const [isDeleting, setIsDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [showImageZoom, setShowImageZoom] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  const images = post.imageUrls || [];

  const handleStatusUpdate = async (status: 'approved' | 'rejected') => {
    try {
      await postService.updatePostStatus(post.id, status);
      toast.success(`Post ${status} successfully`);
    } catch (error) {
      toast.error(`Failed to ${status} post`);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    
    setIsDeleting(true);
    try {
      await postService.deletePost(post.id);
      toast.success('Post deleted successfully');
    } catch (error: any) {
      toast.error('Delete failed. Check permissions.');
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group"
    >
      <Card className="overflow-hidden border-slate-200 transition-all duration-500 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] rounded-[2.5rem] bg-white group-hover:border-indigo-200">
        <CardHeader className="pb-4 pt-8 px-8 space-y-4">
          <div className="flex justify-between items-start gap-4">
            <Badge variant="outline" className={`${cat.color} font-black text-[9px] uppercase tracking-[0.2em] px-3 py-1 rounded-full border-current/20 bg-current/5`}>
              {cat.label}
            </Badge>
            {(isMasterAdmin || isAuthor) && post.status !== 'approved' && (
               <Badge variant="outline" className={`${stat.color} font-black text-[9px] uppercase tracking-[0.2em] px-3 py-1 rounded-full border-current/20 bg-current/5 animate-pulse`}>
                 {stat.label}
               </Badge>
            )}
          </div>
          <CardTitle className="text-xl sm:text-2xl font-black text-slate-900 break-words leading-tight tracking-tight group-hover:text-indigo-600 transition-colors font-display py-1">
            {post.title}
          </CardTitle>
        </CardHeader>
        
        {images.length > 0 && (
          <div className="px-6 mb-6">
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
              {images.map((url, idx) => (
                <div 
                  key={idx}
                  className="flex-none w-[90%] sm:w-[80%] aspect-[16/10] rounded-[2rem] overflow-hidden border border-slate-100 shadow-md relative group/img cursor-zoom-in snap-center bg-slate-50"
                  onClick={() => setShowImageZoom(url)}
                >
                  <img 
                    src={url} 
                    alt={`${post.title} ${idx + 1}`} 
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-700" 
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100">
                     <div className="bg-white/90 backdrop-blur p-3 rounded-3xl shadow-2xl transform scale-75 group-hover/img:scale-100 transition-all">
                       <Maximize2 size={20} className="text-indigo-600" />
                     </div>
                  </div>
                </div>
              ))}
            </div>
            {images.length > 1 && (
              <div className="flex items-center justify-center gap-2 mt-2">
                 <div className="h-1 w-12 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-indigo-600" 
                      animate={{ x: [-24, 24] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                 </div>
                 <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.3em]">Swipe Gallery</p>
              </div>
            )}
          </div>
        )}

        <CardContent className="px-8 pb-6">
          <div className={`relative prose prose-slate prose-sm max-w-none text-slate-600 overflow-hidden break-words transition-all duration-700 ease-out ${!expanded ? 'max-h-24 sm:max-h-32' : 'max-h-[1000px]'}`}>
            <ReactMarkdown>{post.content || ''}</ReactMarkdown>
            {!expanded && post.content && post.content.length > 150 && (
              <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />
            )}
          </div>
          {post.content && post.content.length > 150 && (
            <button 
              onClick={() => setExpanded(!expanded)}
              className="mt-6 text-[10px] font-black uppercase text-indigo-600 hover:text-white tracking-[0.2em] flex items-center gap-2 group/btn bg-indigo-50 px-5 py-2.5 rounded-2xl transition-all hover:bg-slate-900 hover:shadow-xl hover:shadow-indigo-100"
            >
              {expanded ? 'Collapse Story' : 'Read Full Description'}
              <motion.span animate={{ rotate: expanded ? 180 : 0 }} className="inline-block transition-transform">
                <ChevronDown size={14} />
              </motion.span>
            </button>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-4 border-t border-slate-50 bg-slate-50/30 p-8">
          <div className="flex flex-col w-full gap-6">
            {isMasterAdmin && (
              <div className="flex flex-col gap-4 p-5 bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/20 relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/40 rounded-full translate-x-16 -translate-y-16" />
                 
                 <div className="flex items-center justify-between px-1 relative z-10">
                   <div className="flex items-center gap-2">
                     <div className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
                        <Shield size={16} />
                     </div>
                     <div className="flex flex-col">
                       <span className="text-[10px] font-black text-slate-900 tracking-tighter uppercase leading-none">Authority Control</span>
                       <span className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em] mt-1 italic">Verified Resident Action</span>
                     </div>
                   </div>
                   <Badge variant="outline" className={`${stat.color} font-black text-[9px] uppercase border-current/20 px-3 py-1 rounded-full shadow-sm`}>{stat.label}</Badge>
                 </div>
                 
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 relative z-10">
                   {post.status === 'pending' ? (
                     <>
                       <Button 
                         size="sm" 
                         className="bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white font-black h-10 transition-all rounded-xl border border-emerald-100 hover:border-emerald-600 group text-[10px] tracking-widest uppercase"
                         onClick={() => handleStatusUpdate('approved')}
                       >
                         <Check size={14} className="mr-2 group-hover:scale-110 transition-transform" /> APPROVE
                       </Button>
                       <Button 
                         size="sm" 
                         className="bg-amber-50 hover:bg-amber-600 text-amber-600 hover:text-white font-black h-10 transition-all rounded-xl border border-amber-100 hover:border-amber-600 group text-[10px] tracking-widest uppercase"
                         onClick={() => handleStatusUpdate('rejected')}
                       >
                         <X size={14} className="mr-2 group-hover:scale-110 transition-transform" /> REJECT
                       </Button>
                     </>
                   ) : (
                     <div className="sm:col-span-2 flex items-center justify-center bg-slate-50/80 rounded-xl border border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] h-10">
                       FINALIZED
                     </div>
                   )}
                   <Button 
                     size="sm" 
                     disabled={isDeleting}
                     className={`font-black h-10 transition-all rounded-xl border text-[10px] tracking-widest uppercase ${
                       confirmDelete 
                       ? 'bg-red-600 text-white border-red-600' 
                       : 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border-red-100 hover:border-red-600'
                     }`}
                     onClick={handleDelete}
                   >
                     {isDeleting ? (
                       <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                     ) : confirmDelete ? (
                       "CONFIRM?"
                     ) : (
                       <>
                         <Trash2 size={14} className="mr-2" />
                         REMOVE
                       </>
                     )}
                   </Button>
                 </div>
              </div>
            )}

            <div className="flex justify-between items-center w-full px-2">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 border border-slate-100 shadow-sm rounded-2xl bg-indigo-50">
                  <AvatarImage src={getAvatarUrl(post.authorId, post.authorGender)} className="object-cover" />
                  <AvatarFallback className="bg-indigo-600 text-white font-black text-[10px]">
                    {post.authorName?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-xs font-black text-slate-900 leading-none uppercase tracking-widest">{post.authorName || 'Anonymous'}</p>
                  <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-1">
                    <Clock size={10} />
                    {post.createdAt && typeof post.createdAt.toDate === 'function' ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className={`h-10 px-4 gap-2 rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest ${showComments ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'}`}
                  onClick={() => setShowComments(!showComments)}
                >
                  <MessageCircle size={16} />
                  <span>Comments</span>
                </Button>
                
                {(isMasterAdmin || isAuthor) && (
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    disabled={isDeleting}
                    className={`h-10 w-10 min-w-[40px] rounded-2xl transition-all duration-300 ${confirmDelete ? 'text-white bg-red-600 hover:bg-red-700 w-auto px-4' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete();
                    }}
                  >
                    {isDeleting ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : confirmDelete ? (
                      <span className="text-[10px] font-black uppercase whitespace-nowrap">Confirm?</span>
                    ) : (
                      <Trash2 size={18} />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          <AnimatePresence>
            {showComments && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="w-full overflow-hidden"
              >
                <div className="pt-6 mt-4 border-t border-slate-100">
                  <CommentSection postId={post.id} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardFooter>
      </Card>

      <AnimatePresence>
        {showImageZoom && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setShowImageZoom(null)}
          >
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="relative max-w-full max-h-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <Button 
                variant="ghost" 
                size="icon"
                className="absolute top-6 right-6 z-[110] text-slate-900 bg-white hover:bg-red-600 hover:text-white backdrop-blur-xl rounded-full h-12 w-12 border border-white/20 transition-all shadow-2xl"
                onClick={(e) => { e.stopPropagation(); setShowImageZoom(null); }}
              >
                <X size={24} />
              </Button>
              
              <img 
                src={showImageZoom} 
                className="max-w-[95vw] max-h-[85vh] object-contain rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/10"
                alt="Zoomed"
                referrerPolicy="no-referrer"
              />
              
              <div className="absolute -bottom-12 inset-x-0 text-center">
                 <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.4em]">Tap outside to exit view</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
