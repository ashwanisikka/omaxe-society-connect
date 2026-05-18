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
import { getAuth, signInAnonymously } from 'firebase/auth';
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

// Custom database instance restore kiya hai taaki Database (default) not found error na aaye
const db = getFirestore(app, "ai-studio-e12d6e76-8aa2-4bd4-96b2-ed235287a5c2");

// Vercel deployment ke according strict path appId configuration
const appId = "omaxe-society-connect";

// Helper: Custom Timeout Guard jo "SYNCHRONIZING..." ko freeze hone se rokega
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number = 8000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error("Database response timeout. Please check database permissions or network connectivity.")), timeoutMs)
    )
  ]);
};

// Helper: In-memory chronological sorting to prevent query index failures
const sortPostsByDate = (postsArray: any[]) => {
  return postsArray.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });
};

export const postService = {
  // 1. Fetch all posts from standard secure artifacts path
  async getAllPosts() {
    try {
      const postsRef = collection(db, 'artifacts', appId, 'public', 'data', 'posts');
      const querySnapshot = await withTimeout(getDocs(postsRef));
      
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
      console.error("Failed to load posts:", err);
      throw err;
    }
  },

  // 2. Real-time updates subscription under correct path rules
  subscribeToPosts(callback: (posts: any[]) => void) {
    const postsRef = collection(db, 'artifacts', appId, 'public', 'data', 'posts');
    
    return onSnapshot(postsRef, (snapshot) => {
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
  },

  // Dynamic JSON parsing cleanup for Gemini integrations
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
        throw new Error("Invalid JSON formatted configuration received.");
      }
    }
  },

  // 3. Create post under secure artifacts/path with automated authentication check
  async createPost(
    title: string, 
    content: string, 
    category: string, 
    authorName: string, 
    imageUrls: string[]
  ) {
    let currentUser = auth.currentUser;
    if (!currentUser) {
      const cred = await withTimeout(signInAnonymously(auth));
      currentUser = cred.user;
    }

    const newPost = {
      title: title,
      content: content,
      category: category || 'general',
      status: 'pending', // Validation rule compliant initial status
      imageUrl: imageUrls.length > 0 ? imageUrls[0] : null,
      imageUrls: imageUrls,
      authorId: currentUser.uid,
      authorName: authorName || currentUser.displayName || "Resident",
      comments: [],
      createdAt: new Date().toISOString()
    };

    const postsRef = collection(db, 'artifacts', appId, 'public', 'data', 'posts');
    const docRef = await withTimeout(addDoc(postsRef, newPost));
    return { id: docRef.id, ...newPost };
  },

  // 4. Admin Status Updater (Approve / Reject)
  async updatePostStatus(postId: string, status: 'approved' | 'rejected') {
    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
    await withTimeout(updateDoc(postRef, { status }));
  },

  // 5. Delete Post Action
  async deletePost(postId: string) {
    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
    await withTimeout(deleteDoc(postRef));
  },

  // 6. Comments Array Insertion
  async addComment(postId: string, commentText: string) {
    let currentUser = auth.currentUser;
    if (!currentUser) {
      const cred = await withTimeout(signInAnonymously(auth));
      currentUser = cred.user;
    }

    const newComment = {
      text: commentText,
      authorId: currentUser.uid,
      authorName: currentUser.displayName || "Resident",
      createdAt: new Date().toISOString()
    };

    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
    await withTimeout(updateDoc(postRef, {
      comments: arrayUnion(newComment)
    }));

    return newComment;
  }
};
