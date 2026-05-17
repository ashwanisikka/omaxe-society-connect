import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter, DialogClose } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { PostCategory } from '../types';
import { postService } from '../services/postService';
import { geminiService } from '../services/geminiService';
import { useAuth } from '../contexts/AuthContext';
import { PlusCircle, Send, Image as ImageIcon, X } from 'lucide-react';
import { toast } from 'sonner';

interface CreatePostModalProps {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreatePostModal({ isOpen: propOpen, onOpenChange: propOnOpenChange }: CreatePostModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  
  const open = propOpen !== undefined ? propOpen : internalOpen;
  const setOpen = propOnOpenChange !== undefined ? propOnOpenChange : setInternalOpen;
  
  const [loading, setLoading] = useState(false);
  const [moderating, setModerating] = useState(false);
  const { profile } = useAuth();
  
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'general' as PostCategory
  });

  const [images, setImages] = useState<{file: File | null, preview: string}[]>([]);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800; // Limit size to ensure it fits in 1MB document
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Using 0.5 quality to keep each image ~50-100KB
          const compressed = canvas.toDataURL('image/jpeg', 0.5);
          resolve(compressed);
        };
        img.onerror = () => reject(new Error('Image failed to load'));
      };
      reader.onerror = () => reject(new Error('File reader failed'));
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + images.length > 5) {
      toast.error("Maximum 5 images allowed.");
      return;
    }

    setLoading(true);
    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        setImages(prev => [...prev, { file, preview: compressed }]);
      } catch (error) {
        toast.error(`Failed to process ${file.name}`);
      }
    }
    setLoading(false);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.content) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    setLoading(true);
    try {
      const finalImageUrls: string[] = [];

      if (images.length > 0) {
        setModerating(true);
        // Moderate each image
        for (const img of images) {
          const moderation = await geminiService.moderateImage(img.preview, img.file?.type || 'image/jpeg');
          if (!moderation.safe) {
            toast.error("Content Rejected", {
              description: moderation.reason || "One of your images contains inappropriate content.",
              duration: 5000
            });
            setLoading(false);
            setModerating(false);
            return;
          }
          finalImageUrls.push(img.preview);
        }
        setModerating(false);
      }

      await postService.createPost(
        formData.title,
        formData.content,
        formData.category,
        profile?.displayName || 'Anonymous',
        finalImageUrls
      );
      toast.success('Post submitted for approval!');
      setFormData({ title: '', content: '', category: 'general' });
      setImages([]);
      setOpen(false);
    } catch (error) {
      toast.error('Failed to create post');
    } finally {
      setLoading(false);
      setModerating(false);
    }
  };

  const categoryOptions = [
    { value: 'general', label: '📣 Community Updates', desc: 'Events, Announcements, Discussions' },
    { value: 'business', label: '🏢 Business Directory', desc: 'Promote/Find Local Services' },
    { value: 'professionals', label: '🛠️ Find Professionals', desc: 'Plumbers, Electricians, Handymen, House Help' },
    { value: 'vendors', label: '🏪 Local Vendors', desc: 'Maids, Delivery, Daily Needs' },
    { value: 'advertisement', label: '🏷️ Classifieds & Sales', desc: 'Buy/Sell/Rent Property & Items' },
    { value: 'emergency', label: '🚨 Emergency Contacts', desc: 'Security, Hospital important numbers' },
    { value: 'household', label: '🧹 Resident Services', desc: 'Support and requests' },
    { value: 'lost-found', label: '🔍 Lost & Found', desc: 'Recovery search' }
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {propOpen === undefined && (
        <DialogTrigger
          render={
            <Button className="fixed bottom-8 right-8 h-20 w-20 sm:h-28 sm:w-28 rounded-full shadow-[0_32px_80px_-12px_rgba(79,70,229,0.5)] bg-slate-900 hover:bg-indigo-600 transition-all z-40 group border-4 border-white flex flex-col items-center justify-center p-0 hover:scale-110 active:scale-95">
              <PlusCircle className="h-8 w-8 sm:h-10 sm:w-10 text-white group-hover:rotate-90 transition-transform duration-500" />
              <span className="hidden sm:block font-black uppercase text-[8px] tracking-[0.3em] mt-2 text-indigo-400 group-hover:text-white">Broadcast</span>
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden border-none shadow-[0_40px_100px_-15px_rgba(0,0,0,0.5)] rounded-[2rem] bg-white">
        <form onSubmit={handleSubmit} className="flex flex-col max-h-[85vh]">
            <div className="bg-slate-900 pt-10 pb-6 px-8 text-white relative overflow-hidden shrink-0">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/20 rounded-full -translate-y-16 translate-x-16" />
            
            <DialogClose
              render={
                <button 
                  type="button"
                  className="absolute top-4 right-4 p-2.5 rounded-2xl bg-white/10 hover:bg-red-500 hover:scale-110 transition-all z-[60] border border-white/10"
                >
                  <X size={20} className="text-white" />
                </button>
              }
            />

            <DialogHeader className="pt-2">
              <DialogTitle className="text-3xl sm:text-4xl font-black font-display tracking-tighter leading-[0.85] mb-4 uppercase flex flex-col pt-4">
                <span>Add</span>
                <span className="text-indigo-400">Post</span>
              </DialogTitle>
              <DialogDescription className="text-slate-400 font-bold uppercase text-[8px] tracking-[0.4em] leading-relaxed">
                COMMUNITY ADVERTISEMENT & NOTICES
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="grid gap-6 p-8 overflow-y-auto custom-scrollbar flex-grow">
            <div className="grid gap-4">
               <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] ml-2">Select Category</Label>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                 {categoryOptions.map((opt) => (
                   <button
                     key={opt.value}
                     type="button"
                     onClick={() => setFormData(prev => ({ ...prev, category: opt.value as PostCategory }))}
                     className={`p-5 rounded-2xl border-2 text-left transition-all flex items-center gap-4 ${
                       formData.category === opt.value 
                         ? 'border-indigo-600 bg-indigo-50/50 shadow-lg shadow-indigo-100 scale-[1.02]' 
                         : 'border-slate-50 bg-slate-50 hover:border-slate-200 hover:bg-white'
                     }`}
                   >
                     <span className="text-xl shrink-0">{opt.label.split(' ')[0]}</span>
                     <p className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-900 leading-tight">
                       {opt.label.split(' ').slice(1).join(' ')}
                     </p>
                   </button>
                 ))}
               </div>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="title" className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] ml-2">Headline</Label>
              <Textarea
                id="title"
                placeholder="WHAT ARE YOU POSTING?"
                className="rounded-2xl bg-slate-50 border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-100 font-bold transition-all px-6 py-5 text-base uppercase tracking-tight min-h-[120px] resize-none overflow-y-auto break-words whitespace-pre-wrap leading-tight block w-full"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="content" className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] ml-2">Description</Label>
              <Textarea
                id="content"
                placeholder="PROVIDE DETAILS..."
                rows={4}
                className="resize-none rounded-2xl bg-slate-50 border-slate-100 focus:bg-white focus:ring-4 focus:ring-indigo-100 font-medium transition-all p-6 min-h-[120px] text-sm"
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                required
              />
            </div>

            <div className="grid gap-3">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] ml-2">Photos (MAX 5)</Label>
              
              <div className="flex flex-wrap gap-3 mt-1">
                {images.map((img, index) => (
                  <div key={index} className="relative rounded-xl overflow-hidden border-2 border-slate-100 w-20 h-20 group/img shadow-md">
                    <img src={img.preview} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                    >
                      <X size={20} />
                    </button>
                  </div>
                ))}
                
                {images.length < 5 && (
                  <div className="w-20 h-20">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                      id="image-upload"
                    />
                    <label
                      htmlFor="image-upload"
                      className="flex flex-col items-center justify-center w-full h-full border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 hover:border-indigo-600 transition-all group/label"
                    >
                      <ImageIcon className="w-6 h-6 mb-1 text-slate-300 group-hover/label:text-indigo-600 transition-colors" />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="p-8 pt-0">
            <Button 
                type="submit" 
                disabled={loading || moderating} 
                className="w-full h-16 bg-indigo-600 hover:bg-slate-900 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 text-[10px] uppercase tracking-[0.3em] transition-all active:scale-[0.98]"
            >
              {loading ? (
                <span>{moderating ? 'Checking Rules...' : 'Synchronizing...'}</span>
              ) : (
                <div className="flex items-center justify-center gap-3">
                  <Send size={18} />
                  <span>Push to Board</span>
                </div>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
