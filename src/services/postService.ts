import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  arrayUnion,
  onSnapshot
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { initializeApp, getApps, getApp } from 'firebase/app';

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
const db = getFirestore(app, "ai-studio-e12d6e76-8aa2-4bd4-96b2-ed235287a5c2");

export const postService = {
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
        category: data.category || 'general',
        imageUrls: data.imageUrls || (data.imageUrl ? [data.imageUrl] : []),
        comments: data.comments || []
      });
    });
    return posts;
  },

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
          imageUrls: data.imageUrls || (data.imageUrl ? [data.imageUrl] : []),
          comments: data.comments || []
        });
      });
      callback(posts);
    }, (error) => {
      console.error("Firebase subscription error:", error);
    });
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
      console.error("Failed to parse AI response:", e);
      try {
        return JSON.parse(rawResponse);
      } catch (innerError) {
        throw new Error("Invalid JSON from AI.");
      }
    }
  },

  async createPost(title: string, content: string, category: string, authorName: string, imageUrls: string[]) {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("You must be logged in to create a post.");

    const newPost = {
      title: title,
      content: content,
      category: category || 'general',
      imageUrl: imageUrls.length > 0 ? imageUrls[0] : null,
      imageUrls: imageUrls,
      authorId: currentUser.uid,
      authorName: authorName || currentUser.displayName || "Resident",
      comments: [],
      createdAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'posts'), newPost);
    return { id: docRef.id, ...newPost };
  },

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
