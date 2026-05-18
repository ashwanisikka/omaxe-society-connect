import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc,
  updateDoc, 
  deleteDoc,
  arrayUnion,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

// Helper function to check if the current logged-in user is an Admin
const checkIfAdmin = async (uid: string): Promise<boolean> => {
  if (!uid) return false;
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return data.role === 'admin' || auth.currentUser?.email?.toLowerCase() === 'ashwani.sikka@gmail.com';
    }
  } catch (e) {
    console.warn("Failed to check admin status:", e);
  }
  return auth.currentUser?.email?.toLowerCase() === 'ashwani.sikka@gmail.com';
};

// Helper to sanitize and map UI categories to match firestore.rules strictly
const mapCategory = (cat: string): string => {
  const allowed = ['household', 'advertisement', 'general', 'lost-found', 'business', 'professionals', 'vendors', 'emergency'];
  const normalized = (cat || 'general').toLowerCase().trim();
  if (allowed.includes(normalized)) return normalized;
  
  if (normalized.includes('lost') || normalized.includes('found')) return 'lost-found';
  if (normalized.includes('resident') || normalized.includes('service') || normalized.includes('household')) return 'household';
  if (normalized.includes('ad') || normalized.includes('classified') || normalized.includes('sale')) return 'advertisement';
  if (normalized.includes('emergency')) return 'emergency';
  if (normalized.includes('professional')) return 'professionals';
  if (normalized.includes('vendor')) return 'vendors';
  if (normalized.includes('business')) return 'business';
  
  return 'general';
};

export const postService = {
  // 1. Fetch posts chronologically by query-splitting to satisfy database rules without index crashes
  async getAllPosts() {
    const user = auth.currentUser;
    if (!user) return [];

    const postsRef = collection(db, 'posts');
    const isAdmin = user.email?.toLowerCase() === 'ashwani.sikka@gmail.com' || await checkIfAdmin(user.uid);

    let posts: any[] = [];

    try {
      if (isAdmin) {
        // Admins can read all posts directly
        const querySnapshot = await getDocs(postsRef);
        querySnapshot.forEach((doc) => {
          posts.push({ id: doc.id, ...doc.data() });
        });
      } else {
        // Residents read approved posts
        const approvedQuery = query(postsRef, where('status', '==', 'approved'));
        const approvedSnapshot = await getDocs(approvedQuery);
        approvedSnapshot.forEach((doc) => {
          posts.push({ id: doc.id, ...doc.data() });
        });

        // Residents also read their own pending/rejected posts
        const myPostsQuery = query(postsRef, where('authorId', '==', user.uid));
        const myPostsSnapshot = await getDocs(myPostsQuery);
        myPostsSnapshot.forEach((doc) => {
          if (!posts.some(p => p.id === doc.id)) {
            posts.push({ id: doc.id, ...doc.data() });
          }
        });
      }
    } catch (err) {
      console.error("Error fetching posts:", err);
    }

    // Safely parse and sort in memory (RULE 2 compliant)
    return posts.map(post => ({
      ...post,
      category: post.category || 'general',
      status: post.status || 'pending',
      imageUrls: post.imageUrls || (post.imageUrl ? [post.imageUrl] : []),
      comments: post.comments || [],
      createdAt: post.createdAt?.toDate ? post.createdAt.toDate().toISOString() : (post.createdAt || new Date().toISOString())
    })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  // 2. Real-time subscription that adapts to the user's role
  subscribeToPosts(callback: (posts: any[]) => void) {
    const user = auth.currentUser;
    if (!user) return () => {};

    const postsRef = collection(db, 'posts');
    let unsubscribe: () => void = () => {};

    const setup = async () => {
      const isAdmin = user.email?.toLowerCase() === 'ashwani.sikka@gmail.com' || await checkIfAdmin(user.uid);
      
      const q = isAdmin 
        ? postsRef 
        : query(postsRef, where('status', '==', 'approved'));

      unsubscribe = onSnapshot(q, (snapshot) => {
        const posts: any[] = [];
        snapshot.forEach((doc) => {
          posts.push({ id: doc.id, ...doc.data() });
        });

        const mapped = posts.map(post => ({
          ...post,
          category: post.category || 'general',
          status: post.status || 'pending',
          imageUrls: post.imageUrls || (post.imageUrl ? [post.imageUrl] : []),
          comments: post.comments || [],
          createdAt: post.createdAt?.toDate ? post.createdAt.toDate().toISOString() : (post.createdAt || new Date().toISOString())
        })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        callback(mapped);
      }, (error) => {
        console.error("Subscription connection error:", error);
      });
    };

    setup();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  },

  cleanAndParseJSON(rawResponse: string) {
    try {
      let cleanString = rawResponse.trim();
      if (cleanString.startsWith("```")) {
        cleanString = cleanString.slice(3).trim();
        if (cleanString.toLowerCase().startsWith("json")) {
          cleanString = cleanString.slice(4).trim();
        }
      }
      if (cleanString.endsWith("```")) {
        cleanString = cleanString.slice(0, -3).trim();
      }
      return JSON.parse(cleanString.trim());
    } catch (e) {
      console.error("Failed to parse JSON config:", e);
      try {
        return JSON.parse(rawResponse);
      } catch (innerError) {
        throw new Error("Invalid structure configuration received.");
      }
    }
  },

  // 3. Create post with ServerTimestamp and mapped category to perfectly pass validation rules!
  async createPost(
    title: string, 
    content: string, 
    category: string, 
    authorName: string, 
    imageUrls: string[]
  ) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("Post upload failed: Active resident session not found.");
    }

    const newPost = {
      title: title,
      content: content,
      category: mapCategory(category),
      status: 'pending', // Pending status is required for validation rules
      imageUrl: imageUrls.length > 0 ? imageUrls[0] : null,
      imageUrls: imageUrls,
      authorId: currentUser.uid,
      authorName: authorName || currentUser.displayName || "Resident",
      createdAt: serverTimestamp() // ESSENTIAL FIX: Sends proper Firestore Timestamp instead of String!
    };

    const docRef = await addDoc(collection(db, 'posts'), newPost);
    
    // Return with estimated local date representation for instant UI response
    return { 
      id: docRef.id, 
      ...newPost,
      comments: [],
      createdAt: new Date().toISOString()
    };
  },

  // 4. Admin action: Post status modification handler
  async updatePostStatus(postId: string, status: 'approved' | 'rejected') {
    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, { status });
  },

  // 5. Admin action: Post deletion handler
  async deletePost(postId: string) {
    const postRef = doc(db, 'posts', postId);
    await deleteDoc(postRef);
  },

  // 6. Comments arrays list update
  async addComment(postId: string, commentText: string) {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("You must be logged in to comment.");

    const newComment = {
      text: commentText,
      authorId: currentUser.uid,
      authorName: currentUser.displayName || "Resident",
      createdAt: new Date().toISOString()
    };

    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, {
      comments: arrayUnion(newComment)
    });

    return newComment;
  }
};
