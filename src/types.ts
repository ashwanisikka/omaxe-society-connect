export type UserRole = 'user' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  phoneNumber?: string;
  phoneVerified?: boolean;
  displayName: string;
  gender?: 'male' | 'female' | 'other';
  role: UserRole;
  isBlocked?: boolean;
  isSetupComplete?: boolean;
  createdAt: any;
}

export type PostCategory = 'household' | 'advertisement' | 'general' | 'lost-found' | 'business' | 'professionals' | 'vendors' | 'emergency';
export type PostStatus = 'pending' | 'approved' | 'rejected';

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  imageUrls?: string[];
  category: PostCategory;
  status: PostStatus;
  authorGender?: 'male' | 'female' | 'other';
  createdAt: any;
  updatedAt?: any;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: any;
}
