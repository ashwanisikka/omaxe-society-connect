import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  arrayUnion,
  onSnapshot
} from 'firebase/firestore';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { initializeApp, getApps, getApp } from 'firebase/app';

// 1. Firebase configuration setup (Production aur Preview modes ke liye safe fallback)
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      projectId: "omaxe-heights-portal",
      appId: "1:398226441084:web:9c11756e4f220d8d275af9",
      apiKey: "AIzaSyBdslph0X5MP0_UMMiL8dt_q9BLmxzJuw0",
      authDomain: "omaxe-heights-portal.firebaseapp.com",
      storageBucket: "omaxe-heights-portal.firebasestorage.app",
      messagingSenderId: "398226441084"
    };

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app, "ai-studio-e12d6e76-8aa2-4bd4-96b2-ed235287a5c2");

// RULE 1: Standard strict artifact path structure mapping
const appId = typeof __app_id !== 'undefined' ? __app_id : 'omaxe-society-connect';

// RULE 3: Secure Auth Initialization wrapper
const ensureAuth = async () => {
  if (auth.currentUser) return auth.currentUser;
  
  if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
    const cred = await signInWithCustomToken(auth, __initial_auth_token);
    return cred.user;
  } else {
    const cred = await signInAnonymously(auth);
    return cred.user;
  }
};

export const postService = {
  // 1. Sabhi posts fetch karke in-memory chronological sorting karta hai (RULE 2 compliant)
  async getAllPosts() {
    const user = await ensureAuth();
    if (!user) return [];

    const postsRef = collection(db, 'artifacts', appId, 'public', 'data', 'posts');
    const querySnapshot = await getDocs(postsRef);
    
    const posts: any[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      posts.push({ 
        id: doc.id, 
        ...data,
        category: data.category || 'general',
        status: data.status || 'pending',
        imageUrls: data.imageUrls || (data.imageUrl ? [data.imageUrl] : []),
        comments: data.comments || []
      });
    });

    // In-memory sort (newest first) to avoid complex Firebase index requirements
    return posts.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  },

  // 2. Real-time changes subscription with instant in-memory sorts (RULE 2 compliant)
  subscribeToPosts(callback: (posts: any[]) => void) {
    let unsubscribe: (() => void) | null = null;

    ensureAuth().then((user) => {
      if (!user) return;

      const postsRef = collection(db, 'artifacts', appId, 'public', 'data', 'posts');
      unsubscribe = onSnapshot(postsRef, (snapshot) => {
        const posts: any[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          posts.push({ 
            id: doc.id, 
            ...data,
            category: data.category || 'general',
            status: data.status || 'pending',
            imageUrls: data.imageUrls || (data.imageUrl ? [data.imageUrl] : []),
            comments: data.comments || []
          });
        });

        const sorted = posts.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });

        callback(sorted);
      }, (error) => {
        console.error("Firebase subscription error:", error);
      });
    }).catch((err) => {
      console.error("Firebase auth error in subscription:", err);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  },

  // Clean JSON response utility
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
      console.error("Failed to parse sanitized AI response. Falling back to raw:", e);
      try {
        return JSON.parse(rawResponse);
      } catch (innerError) {
        throw new Error("Invalid JSON formatting received from AI validation routing.");
      }
    }
  },

  // 3. Write-secure creation of post exactly mapping 5 args
  async createPost(
    title: string, 
    content: string, 
    category: string, 
    authorName: string, 
    imageUrls: string[]
  ) {
    const user = await ensureAuth();
    if (!user) throw new Error("Authentication session not valid. Please refresh page.");

    const newPost = {
      title: title,
      content: content,
      category: category || 'general',
      status: 'pending', // Validation check mandatory state
      imageUrl: imageUrls.length > 0 ? imageUrls[0] : null,
      imageUrls: imageUrls,
      authorId: user.uid,
      authorName: authorName || "Resident",
      comments: [],
      createdAt: new Date().toISOString()
    };

    const postsRef = collection(db, 'artifacts', appId, 'public', 'data', 'posts');
    const docRef = await addDoc(postsRef, newPost);
    return { id: docRef.id, ...newPost };
  },

  // 4. Admin Post Status Updates
  async updatePostStatus(postId: string, status: 'approved' | 'rejected') {
    const user = await ensureAuth();
    if (!user) return;

    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
    await updateDoc(postRef, { status });
  },

  // 5. Delete Post Action
  async deletePost(postId: string) {
    const user = await ensureAuth();
    if (!user) return;

    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
    await deleteDoc(postRef);
  },

  // 6. Comment Submission Wrapper
  async addComment(postId: string, commentText: string) {
    const user = await ensureAuth();
    if (!user) throw new Error("You must be logged in to comment.");

    const newComment = {
      text: commentText,
      authorId: user.uid,
      authorName: user.displayName || "Resident",
      createdAt: new Date().toISOString()
    };

    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
    await updateDoc(postRef, {
      comments: arrayUnion(newComment)
    });

    return newComment;
  }
};
