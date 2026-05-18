import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  arrayUnion,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { initializeApp, getApps, getApp } from 'firebase/app';

// 1. Firebase configurations block
const firebaseConfig = {
  projectId: "omaxe-heights-portal",
  appId: "1:398226441084:web:9c11756e4f220d8d275af9",
  apiKey: "AIzaSyBdslph0X5MP0_UMMiL8dt_q9BLmxzJuw0",
  authDomain: "omaxe-heights-portal.firebaseapp.com",
  storageBucket: "omaxe-heights-portal.firebasestorage.app",
  messagingSenderId: "398226441084"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// AUTO-DETECTION: Check if the application is running inside our system's Preview Sandbox or Live Vercel Production
const isSandbox = typeof __firebase_config !== 'undefined' || (typeof window !== 'undefined' && window.location.hostname.includes('gemini.google.com'));

// Dynamic Database Target:
// Sandbox uses our custom preview instance ID to bypass database not found crashes
// Production (Vercel) uses the default Firestore instance in your project omaxe-heights-portal
const db = isSandbox 
  ? getFirestore(app, "ai-studio-e12d6e76-8aa2-4bd4-96b2-ed235287a5c2")
  : getFirestore(app);

const sandboxAppId = typeof __app_id !== 'undefined' ? __app_id : 'omaxe-society-connect';

// Helper to get correct Firestore Reference dynamically based on the active environment
const getPostsCollectionRef = () => {
  if (isSandbox) {
    return collection(db, 'artifacts', sandboxAppId, 'public', 'data', 'posts');
  } else {
    return collection(db, 'posts');
  }
};

const getPostDocumentRef = (postId: string) => {
  if (isSandbox) {
    return doc(db, 'artifacts', sandboxAppId, 'public', 'data', 'posts', postId);
  } else {
    return doc(db, 'posts', postId);
  }
};

// RULE 3 - Setup secure Sandbox auth session only when running inside sandbox environment
const ensureSandboxAuth = async () => {
  if (!isSandbox) return auth.currentUser;
  if (auth.currentUser) return auth.currentUser;

  try {
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
      const cred = await signInWithCustomToken(auth, __initial_auth_token);
      return cred.user;
    } else {
      const cred = await signInAnonymously(auth);
      return cred.user;
    }
  } catch (err) {
    console.error("Sandbox authentication handshake failed:", err);
    return null;
  }
};

// RULE 2 - In-Memory chronological sorting fallback for clean index-free operations
const sortPostsByDate = (postsArray: any[]) => {
  return postsArray.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA; // Newest posts first
  });
};

export const postService = {
  // 1. Fetch board posts dynamically adapting order index constraints
  async getAllPosts() {
    await ensureSandboxAuth();
    const postsRef = getPostsCollectionRef();
    
    let querySnapshot;
    if (isSandbox) {
      querySnapshot = await getDocs(postsRef);
    } else {
      const q = query(postsRef, orderBy('createdAt', 'desc'));
      querySnapshot = await getDocs(q);
    }
    
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

    return isSandbox ? sortPostsByDate(posts) : posts;
  },

  // 2. Dynamic Real-time Sync adapter that respects user session boundaries
  subscribeToPosts(callback: (posts: any[]) => void) {
    let unsubscribe: (() => void) | null = null;

    const setupSubscription = () => {
      const postsRef = getPostsCollectionRef();
      const q = isSandbox ? postsRef : query(postsRef, orderBy('createdAt', 'desc'));

      unsubscribe = onSnapshot(q, (snapshot) => {
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
        callback(isSandbox ? sortPostsByDate(posts) : posts);
      }, (error) => {
        console.error("Firebase subscription sync error:", error);
      });
    };

    if (isSandbox) {
      ensureSandboxAuth().then(() => setupSubscription());
    } else {
      setupSubscription();
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  },

  // Gemini API response configurations dynamic cleaner
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
      console.error("Failed to parse AI configuration payload:", e);
      try {
        return JSON.parse(rawResponse);
      } catch (innerError) {
        throw new Error("Invalid config received from response parsing rules.");
      }
    }
  },

  // 3. Adaptive Post Creator (Supports both anonymous sandbox writes and active production user logins)
  async createPost(
    title: string, 
    content: string, 
    category: string, 
    authorName: string, 
    imageUrls: string[]
  ) {
    const user = isSandbox ? await ensureSandboxAuth() : auth.currentUser;
    
    const authorId = user ? user.uid : "anonymous_resident";
    const finalAuthorName = authorName || user?.displayName || "Resident";

    const newPost = {
      title: title,
      content: content,
      category: category || 'general',
      status: 'pending', // Validation rule compliant default state
      imageUrl: imageUrls.length > 0 ? imageUrls[0] : null,
      imageUrls: imageUrls,
      authorId: authorId,
      authorName: finalAuthorName,
      comments: [],
      createdAt: new Date().toISOString()
    };

    const postsRef = getPostsCollectionRef();
    const docRef = await addDoc(postsRef, newPost);
    return { id: docRef.id, ...newPost };
  },

  // 4. Update Post Status (Approve / Reject)
  async updatePostStatus(postId: string, status: 'approved' | 'rejected') {
    const postRef = getPostDocumentRef(postId);
    await updateDoc(postRef, { status });
  },

  // 5. Delete Post Action
  async deletePost(postId: string) {
    const postRef = getPostDocumentRef(postId);
    await deleteDoc(postRef);
  },

  // 6. Comments array dynamic updater
  async addComment(postId: string, commentText: string) {
    const user = isSandbox ? await ensureSandboxAuth() : auth.currentUser;
    
    const authorId = user ? user.uid : "anonymous_resident";
    const authorName = user?.displayName || "Resident";

    const newComment = {
      text: commentText,
      authorId: authorId,
      authorName: authorName,
      createdAt: new Date().toISOString()
    };

    const postRef = getPostDocumentRef(postId);
    await updateDoc(postRef, {
      comments: arrayUnion(newComment)
    });

    return newComment;
  }
};
