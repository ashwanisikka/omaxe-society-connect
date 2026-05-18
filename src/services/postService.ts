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

// Custom Firestore database instance configuration
const db = getFirestore(app, "ai-studio-e12d6e76-8aa2-4bd4-96b2-ed235287a5c2");

// Standard security-rule allowed App ID path
const appId = "omaxe-society-connect";

// Helper: Secure Auth Session Wrapper (RULE 3 Compliant - Ensures active session before query/write)
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

// Helper: In-Memory sorting (RULE 2 Compliant - No complex queries/indexes needed)
const sortPostsByDate = (postsArray: any[]) => {
  return postsArray.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA; // Newest first
  });
};

export const postService = {
  // 1. Fetch all posts with custom database standard path & in-memory sort
  async getAllPosts() {
    await ensureAuth();
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

  // 2. Real-time subscription sync with robust Auth Wrapper (RULE 3 and RULE 2 compliant)
  subscribeToPosts(callback: (posts: any[]) => void) {
    let unsubscribe: (() => void) | null = null;

    ensureAuth().then(() => {
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
        console.error("Firebase subscription error:", error);
      });
    }).catch((err) => {
      console.error("Auth error in subscription wrapper:", err);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  },

  // Gemini sanitization parser
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
        throw new Error("Invalid JSON from AI validation routing.");
      }
    }
  },

  // 3. Database post creator mapping standard allowed writes
  async createPost(
    title: string, 
    content: string, 
    category: string, 
    authorName: string, 
    imageUrls: string[]
  ) {
    const user = await ensureAuth();
    if (!user) throw new Error("Authentication failed. Please reload page.");

    const newPost = {
      title: title,
      content: content,
      category: category || 'general',
      status: 'pending', // REQUIRED STATE FOR RULES APPROVAL
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

  // 4. Status update action (Approve / Reject)
  async updatePostStatus(postId: string, status: 'approved' | 'rejected') {
    await ensureAuth();
    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
    await updateDoc(postRef, { status });
  },

  // 5. Delete post action
  async deletePost(postId: string) {
    await ensureAuth();
    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
    await deleteDoc(postRef);
  },

  // 6. Comment poster
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
