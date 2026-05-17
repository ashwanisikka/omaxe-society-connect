import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { postService } from '../services/postService';
import { Comment } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Send, Trash2, User, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface CommentSectionProps {
  postId: string;
}

export function CommentSection({ postId }: CommentSectionProps) {
  const { profile, isAdmin } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = postService.subscribeToComments(postId, (fetchedComments) => {
      setComments(fetchedComments as Comment[]);
    });
    return () => unsubscribe();
  }, [postId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !profile) return;

    setLoading(true);
    try {
      await postService.addComment(postId, newComment.trim(), profile.displayName);
      setNewComment('');
    } catch (error) {
      toast.error('Failed to add comment');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;
    try {
      await postService.deleteComment(postId, commentId);
      toast.success('Comment deleted');
    } catch (error) {
      toast.error('Failed to delete comment');
    }
  };

  return (
    <div className="space-y-4 pt-4 mt-4 border-t border-gray-100">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        <MessageSquare size={14} strokeWidth={2.5} />
        <span className="text-[10px] font-black uppercase tracking-widest">
          Discussion ({comments.length})
        </span>
      </div>

      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 scrollbar-hide">
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-3 group">
            <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex-shrink-0 flex items-center justify-center text-gray-400">
              <User size={14} />
            </div>
            <div className="flex-1 bg-gray-50 rounded-2xl p-3 relative hover:bg-white hover:shadow-lg transition-all duration-300">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[11px] font-black text-gray-900 uppercase">{comment.authorName}</span>
                <span className="text-[9px] font-bold text-gray-400 uppercase italic">
                  {comment.createdAt ? formatDistanceToNow(comment.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                </span>
              </div>
              <p className="text-xs text-gray-600 font-medium">{comment.content}</p>
              
              {(isAdmin || profile?.uid === comment.authorId) && (
                <button 
                  onClick={() => handleDelete(comment.id)}
                  className="absolute -right-1 -top-1 w-6 h-6 bg-white shadow-md rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        ))}
        {comments.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest italic">No responses yet</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
        <Input
          placeholder="Write a response..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          className="rounded-xl h-10 text-xs bg-gray-50 border-gray-100 focus:bg-white transition-all font-bold"
        />
        <Button 
          type="submit" 
          disabled={loading || !newComment.trim()}
          className="h-10 w-10 shadow-lg bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl flex-shrink-0"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </Button>
      </form>
    </div>
  );
}
