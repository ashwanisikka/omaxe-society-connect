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

// Firebase configuration settings block
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

// Aapke default database se connect ho raha hai (No custom ID string)
const db = getFirestore(app);

export const postService = {
  // 1. Seedhe 'posts' collection se fetch karega aur rendering crash rokega
  async getAllPosts() {
    const postsRef = collection(db, 'posts');
    const q = query(postsRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const posts: any[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      posts.push({ 
        id: doc.id, 
        ...data,
        category: data.category || 'general', // Safeguard: rendering crash rokne ke liye
        status: data.status || 'pending',
        imageUrls: data.imageUrls || (data.imageUrl ? [data.imageUrl] : []),
        comments: data.comments || []
      });
    });
    return posts;
  },

  // 2. Real-time sync ke liye subscribe listener
  subscribeToPosts(callback: (posts: any[]) => void) {
    const postsRef = collection(db, 'posts');
    const q = query(postsRef, orderBy('createdAt', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
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
  },

  // AI response clean karne ka utility function
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
        throw new Error("Invalid JSON formatting.");
      }
    }
  },

  // 3. Seedhe 'posts' collection me naya post create karega
  async createPost(
    title: string, 
    content: string, 
    category: string, 
    authorName: string, 
    imageUrls: string[]
  ) {
    let currentUser = auth.currentUser;
    if (!currentUser) {
      const authCredential = await signInAnonymously(auth);
      currentUser = authCredential.user;
    }

    const newPost = {
      title: title,
      content: content,
      category: category || 'general',
      status: 'pending', // Direct rule bypass state
      imageUrl: imageUrls.length > 0 ? imageUrls[0] : null,
      imageUrls: imageUrls,
      authorId: currentUser.uid,
      authorName: authorName || "Resident",
      comments: [],
      createdAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'posts'), newPost);
    return { id: docRef.id, ...newPost };
  },

  // 4. Post status update karega (Approve / Reject)
  async updatePostStatus(postId: string, status: 'approved' | 'rejected') {
    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, { status });
  },

  // 5. Post delete karega
  async deletePost(postId: string) {
    const postRef = doc(db, 'posts', postId);
    await deleteDoc(postRef);
  },

  // 6. Comment add karega
  async addComment(postId: string, commentText: string) {
    let currentUser = auth.currentUser;
    if (!currentUser) {
      const authCredential = await signInAnonymously(auth);
      currentUser = authCredential.user;
    }

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
