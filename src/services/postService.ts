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

// AAPKA APNA CUSTOM DATABASE INSTANCE
const db = getFirestore(app, "ai-studio-e12d6e76-8aa2-4bd4-96b2-ed235287a5c2");

// Safe and conflict-free Auth Initialization
const getAuthenticatedUser = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    // Agar Firebase auth pehle se ready hai aur user logged-in hai
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }

    // Auth state change ka wait karega taaki session conflict (user-mismatch) na aaye
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      unsubscribe();
      if (user) {
        resolve(user);
      } else {
        try {
          // Agar koi active session nahi hai, toh safe anonymous login trigger karega
          const cred = await signInAnonymously(auth);
          resolve(cred.user);
        } catch (err) {
          console.error("Anonymous authentication failed:", err);
          reject(err);
        }
      }
    });
  });
};

export const postService = {
  // 1. Root 'posts' collection se chronological order mein posts fetch karta hai
  async getAllPosts() {
    await getAuthenticatedUser();
    const postsRef = collection(db, 'posts');
    const q = query(postsRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const posts: any[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      posts.push({ 
        id: doc.id, 
        ...data,
        category: data.category || 'general', // UI rendering crash safeguard
        status: data.status || 'pending',
        imageUrls: data.imageUrls || (data.imageUrl ? [data.imageUrl] : []),
        comments: data.comments || []
      });
    });
    return posts;
  },

  // 2. Real-time changes subscription on root 'posts' collection
  subscribeToPosts(callback: (posts: any[]) => void) {
    let unsubscribeSnapshot: (() => void) | null = null;

    getAuthenticatedUser().then(() => {
      const postsRef = collection(db, 'posts');
      const q = query(postsRef, orderBy('createdAt', 'desc'));
      
      unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
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
        callback(posts);
      }, (error) => {
        console.error("Firebase subscription error:", error);
      });
    }).catch((err) => {
      console.error("Auth initialization error in subscription:", err);
    });

    return () => {
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  },

  // Gemini utility clean parser
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
      console.error("Failed to parse JSON response:", e);
      try {
        return JSON.parse(rawResponse);
      } catch (innerError) {
        throw new Error("Invalid JSON configuration layout received.");
      }
    }
  },

  // 3. Root 'posts' collection mein naya post add karta hai
  async createPost(
    title: string, 
    content: string, 
    category: string, 
    authorName: string, 
    imageUrls: string[]
  ) {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Authentication session is required to post on board.");

    const newPost = {
      title: title,
      content: content,
      category: category || 'general',
      status: 'pending', // Pending status is required for admin moderation validation rules
      imageUrl: imageUrls.length > 0 ? imageUrls[0] : null,
      imageUrls: imageUrls,
      authorId: user.uid,
      authorName: authorName || user.displayName || "Resident",
      comments: [],
      createdAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'posts'), newPost);
    return { id: docRef.id, ...newPost };
  },

  // 4. Admin action: Post approve/reject handler
  async updatePostStatus(postId: string, status: 'approved' | 'rejected') {
    await getAuthenticatedUser();
    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, { status });
  },

  // 5. Admin action: Post delete handler
  async deletePost(postId: string) {
    await getAuthenticatedUser();
    const postRef = doc(db, 'posts', postId);
    await deleteDoc(postRef);
  },

  // 6. Comment poster inside comments array
  async addComment(postId: string, commentText: string) {
    const user = await getAuthenticatedUser();
    if (!user) throw new Error("Authentication is required to post comments.");

    const newComment = {
      text: commentText,
      authorId: user.uid,
      authorName: user.displayName || "Resident",
      createdAt: new Date().toISOString()
    };

    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, {
      comments: arrayUnion(newComment)
    });

    return newComment;
  }
};
