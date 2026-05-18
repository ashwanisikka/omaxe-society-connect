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

// 1. Firebase configuration block
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

// Custom Database instance use ho raha hai
const db = getFirestore(app, "ai-studio-e12d6e76-8aa2-4bd4-96b2-ed235287a5c2");

// Dynamic App ID check
const appId = typeof __app_id !== 'undefined' ? __app_id : 'omaxe-society-connect';

// RULE 3 - Global Promise to ensure authentication resolves FIRST before any query
const authPromise = (async () => {
  try {
    if (auth.currentUser) return auth.currentUser;
    
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
      const cred = await signInWithCustomToken(auth, __initial_auth_token);
      return cred.user;
    } else {
      const cred = await signInAnonymously(auth);
      return cred.user;
    }
  } catch (err) {
    console.error("Firebase auth initialization failed:", err);
    return null;
  }
})();

// RULE 2 - In-Memory sorting wrapper (orderBy query contains security limitations)
const sortPostsByDate = (postsArray: any[]) => {
  return postsArray.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA; // Newest first
  });
};

export const postService = {
  // 1. Fetch all posts securely after auth completes successfully
  async getAllPosts() {
    const user = await authPromise;
    if (!user) throw new Error("Authentication failed. Cannot fetch noticeboard posts.");

    // RULE 1: Standard public data path
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

    return sortPostsByDate(posts);
  },

  // 2. Real-time subscription sync with explicit Auth Block Guard (RULE 3 and RULE 2 compliant)
  subscribeToPosts(callback: (posts: any[]) => void) {
    let unsubscribe: (() => void) | null = null;
    let active = true;

    authPromise.then((user) => {
      if (!active) return;
      if (!user) {
        console.error("Subscription blocked: Auth promise resolved to null.");
        return;
      }

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
        callback(sortPostsByDate(posts));
      }, (error) => {
        console.error("Firebase subscription error in posts:", error);
      });
    });

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  },

  // Dynamic JSON parsing utility for Gemini API response configs
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
      console.error("Failed to parse JSON:", e);
      try {
        return JSON.parse(rawResponse);
      } catch (innerError) {
        throw new Error("Invalid JSON formatting received.");
      }
    }
  },

  // 3. Database post creator mapping standard allowed writes securely after auth
  async createPost(
    title: string, 
    content: string, 
    category: string, 
    authorName: string, 
    imageUrls: string[]
  ) {
    const user = await authPromise;
    if (!user) throw new Error("Database session failed. Authentication not valid.");

    const newPost = {
      title: title,
      content: content,
      category: category || 'general',
      status: 'pending', // Keeps initial post state to pending for moderation
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

  // 4. Admin Action: Approve / Reject state update
  async updatePostStatus(postId: string, status: 'approved' | 'rejected') {
    const user = await authPromise;
    if (!user) return;

    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
    await updateDoc(postRef, { status });
  },

  // 5. Admin Action: Delete Post
  async deletePost(postId: string) {
    const user = await authPromise;
    if (!user) return;

    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
    await deleteDoc(postRef);
  },

  // 6. Comments array updates
  async addComment(postId: string, commentText: string) {
    const user = await authPromise;
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
