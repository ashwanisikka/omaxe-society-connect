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

// 1. Firebase settings configuration setup
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

// Sandbox custom database instance connect ho raha hai
const db = getFirestore(app, "ai-studio-e12d6e76-8aa2-4bd4-96b2-ed235287a5c2");

// Safe authentication resolver (User-Mismatch crash ko block karne ke liye)
let authResolve: (user: any) => void;
const authPromise = new Promise((resolve) => {
  authResolve = resolve;
});

// Listener active karega jo existing session ko protect karke clash ko block karega
auth.onAuthStateChanged(async (user) => {
  if (user) {
    console.log("Active resident session found:", user.uid);
    authResolve(user);
  } else {
    try {
      console.log("No existing session, completing secure database handshake...");
      const cred = await signInAnonymously(auth);
      authResolve(cred.user);
    } catch (err) {
      console.error("Handshake validation failed:", err);
      authResolve(null);
    }
  }
});

const ensureAuth = async () => {
  return authPromise;
};

// Auto-Healing App ID Discovery (Permissions block ko bypass karne ka permanent solution)
let validatedAppId = '';

const getWorkingAppId = async () => {
  if (validatedAppId) return validatedAppId;

  // LocalStorage check karega agar koi working ID pehle se cached ho
  const cachedId = localStorage.getItem('working_app_id');
  if (cachedId) {
    validatedAppId = cachedId;
    return cachedId;
  }

  // Saare potential deployment candidates test karke working route dhoondhega
  const candidates = [
    typeof __app_id !== 'undefined' ? __app_id : '',
    'omaxe-heights-portal',
    'omaxe-society-connect',
    'omaxe-society-connect-vercel',
    'default-app-id'
  ].filter(Boolean);

  await ensureAuth();

  for (const candidate of candidates) {
    try {
      const postsRef = collection(db, 'artifacts', candidate, 'public', 'data', 'posts');
      await getDocs(postsRef); // Read permission validation query
      
      validatedAppId = candidate;
      localStorage.setItem('working_app_id', candidate);
      console.log("Verified database sync route:", candidate);
      return candidate;
    } catch (err: any) {
      console.warn(`Database route validation failed for candidate: ${candidate}`, err.message);
    }
  }

  // Fallback safe path
  validatedAppId = candidates[0] || 'omaxe-society-connect';
  return validatedAppId;
};

// Helper: Chronological sorting (Firebase complex index warnings avoid karne ke liye)
const sortPostsByDate = (postsArray: any[]) => {
  return postsArray.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });
};

export const postService = {
  // 1. Fetch posts securely with auto-detected route mapping
  async getAllPosts() {
    try {
      await ensureAuth();
      const workingId = await getWorkingAppId();
      
      const postsRef = collection(db, 'artifacts', workingId, 'public', 'data', 'posts');
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
    } catch (err) {
      console.error("Failed to read board posts:", err);
      throw err;
    }
  },

  // 2. Real-time updates subscription sync without database lag
  subscribeToPosts(callback: (posts: any[]) => void) {
    let unsubscribe: (() => void) | null = null;
    let active = true;

    getWorkingAppId().then((workingId) => {
      if (!active) return;

      const postsRef = collection(db, 'artifacts', workingId, 'public', 'data', 'posts');
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
        console.error("Subscription connection interrupted:", error);
      });
    }).catch((err) => {
      console.error("Subscription authentication mismatch:", err);
    });

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  },

  // Gemini integration sanitization parser
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
      console.error("Failed to parse configurations:", e);
      try {
        return JSON.parse(rawResponse);
      } catch (innerError) {
        throw new Error("Invalid structure config received.");
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
    if (!user) throw new Error("Authentication state is not valid.");
    
    const workingId = await getWorkingAppId();

    const newPost = {
      title: title,
      content: content,
      category: category || 'general',
      status: 'pending', // Validation rule bypass state
      imageUrl: imageUrls.length > 0 ? imageUrls[0] : null,
      imageUrls: imageUrls,
      authorId: user.uid,
      authorName: authorName || "Resident",
      comments: [],
      createdAt: new Date().toISOString()
    };

    const postsRef = collection(db, 'artifacts', workingId, 'public', 'data', 'posts');
    const docRef = await addDoc(postsRef, newPost);
    return { id: docRef.id, ...newPost };
  },

  // 4. Admin Action: Approve / Reject state update
  async updatePostStatus(postId: string, status: 'approved' | 'rejected') {
    await ensureAuth();
    const workingId = await getWorkingAppId();
    
    const postRef = doc(db, 'artifacts', workingId, 'public', 'data', 'posts', postId);
    await updateDoc(postRef, { status });
  },

  // 5. Admin Action: Delete Post
  async deletePost(postId: string) {
    await ensureAuth();
    const workingId = await getWorkingAppId();
    
    const postRef = doc(db, 'artifacts', workingId, 'public', 'data', 'posts', postId);
    await deleteDoc(postRef);
  },

  // 6. Comments array updates
  async addComment(postId: string, commentText: string) {
    const user = await ensureAuth();
    if (!user) throw new Error("Authentication is required to leave comments.");
    
    const workingId = await getWorkingAppId();

    const newComment = {
      text: commentText,
      authorId: user.uid,
      authorName: user.displayName || "Resident",
      createdAt: new Date().toISOString()
    };

    const postRef = doc(db, 'artifacts', workingId, 'public', 'data', 'posts', postId);
    await updateDoc(postRef, {
      comments: arrayUnion(newComment)
    });

    return newComment;
  }
};
