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
import { getAuth, signInAnonymously } from 'firebase/auth';
import { initializeApp, getApps, getApp } from 'firebase/app';

// 1. Firebase configuration settings block
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

// Safe database initialization to prevent app crash if database configuration is missing
let db: any;
try {
  // Try to use the default database first
  db = getFirestore(app);
} catch (e) {
  console.warn("Falling back to custom database instance due to initialization error:", e);
  db = getFirestore(app, "ai-studio-e12d6e76-8aa2-4bd4-96b2-ed235287a5c2");
}

// Check if running in standard sandbox or production environment
const isSandbox = typeof __firebase_config !== 'undefined';
const sandboxAppId = typeof __app_id !== 'undefined' ? __app_id : 'omaxe-society-connect';

// Safe Collection Reference mapping
const getCollectionRef = () => {
  if (isSandbox) {
    return collection(db, 'artifacts', sandboxAppId, 'public', 'data', 'posts');
  } else {
    return collection(db, 'posts');
  }
};

const getDocumentRef = (postId: string) => {
  if (isSandbox) {
    return doc(db, 'artifacts', sandboxAppId, 'public', 'data', 'posts', postId);
  } else {
    return doc(db, 'posts', postId);
  }
};

// Safe Auth state checker
const getAuthenticatedUser = (): Promise<any> => {
  return new Promise((resolve) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      unsubscribe();
      if (user) {
        resolve(user);
      } else {
        try {
          const cred = await signInAnonymously(auth);
          resolve(cred.user);
        } catch (err) {
          console.error("Anonymous authentication failed:", err);
          resolve(null);
        }
      }
    });
  });
};

export const postService = {
  // 1. Fetch posts with error handling fallback to keep UI stable
  async getAllPosts() {
    try {
      await getAuthenticatedUser();
      const postsRef = getCollectionRef();
      
      let querySnapshot;
      try {
        const q = isSandbox ? postsRef : query(postsRef, orderBy('createdAt', 'desc'));
        querySnapshot = await getDocs(q);
      } catch (err) {
        console.warn("Query failed, retrying without order parameter:", err);
        querySnapshot = await getDocs(postsRef);
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

      // Simple client-side sorting fallback
      return posts.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
    } catch (error) {
      console.error("Failed to load noticeboard posts:", error);
      return [];
    }
  },

  // 2. Real-time updates subscription sync
  subscribeToPosts(callback: (posts: any[]) => void) {
    let unsubscribe: (() => void) | null = null;

    getAuthenticatedUser().then((user) => {
      if (!user) return;
      const postsRef = getCollectionRef();
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

        const sorted = posts.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        callback(sorted);
      }, (error) => {
        console.error("Real-time sync subscription error:", error);
      });
    });

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
      console.error("Failed to parse JSON configuration:", e);
      try {
        return JSON.parse(rawResponse);
      } catch (innerError) {
        throw new Error("Invalid format config configuration.");
      }
    }
  },

  // 3. Create post securely under adaptive path collections
  async createPost(
    title: string, 
    content: string, 
    category: string, 
    authorName: string, 
    imageUrls: string[]
  ) {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Authentication session not valid. Please login first.");

    const newPost = {
      title: title,
      content: content,
      category: category || 'general',
      status: 'pending', // Validation rule compliant default state
      imageUrl: imageUrls.length > 0 ? imageUrls[0] : null,
      imageUrls: imageUrls,
      authorId: user.uid,
      authorName: authorName || user.displayName || "Resident",
      comments: [],
      createdAt: new Date().toISOString()
    };

    const postsRef = getCollectionRef();
    const docRef = await addDoc(postsRef, newPost);
    return { id: docRef.id, ...newPost };
  },

  // 4. Update Post Status (Approve / Reject)
  async updatePostStatus(postId: string, status: 'approved' | 'rejected') {
    await getAuthenticatedUser();
    const postRef = getDocumentRef(postId);
    await updateDoc(postRef, { status });
  },

  // 5. Delete Post Action
  async deletePost(postId: string) {
    await getAuthenticatedUser();
    const postRef = getDocumentRef(postId);
    await deleteDoc(postRef);
  },

  // 6. Comments list updates
  async addComment(postId: string, commentText: string) {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("You must be logged in to comment.");

    const newComment = {
      text: commentText,
      authorId: user.uid,
      authorName: user.displayName || "Resident",
      createdAt: new Date().toISOString()
    };

    const postRef = getDocumentRef(postId);
    await updateDoc(postRef, {
      comments: arrayUnion(newComment)
    });

    return newComment;
  }
};
