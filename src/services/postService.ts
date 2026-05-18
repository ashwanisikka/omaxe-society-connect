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

// 1. Firebase configuration settings block
const firebaseConfig = {
  projectId: "omaxe-heights-portal",
  appId: "1:398226441084:web:9c11756e4f220d8d275af9",
  apiKey: "AIzaSyBdslph0X5MP0_UMMiL8dt_q9BLmxzJuw0",
  authDomain: "omaxe-heights-portal.firebaseapp.com",
  storageBucket: "omaxe-heights-portal.firebasestorage.app",
  messagingSenderId: "398226441084"
};

// Main Central App & Auth instance (Used exclusively to read real user's profile details if they are logged in)
const mainApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const mainAuth = getAuth(mainApp);

// CRITICAL ISOLATION: Initialize an independent secondary Firebase app instance
// to satisfy sandbox database auth rules WITHOUT hijacking the main app's global authentication state!
// This prevents Google/Phone login redirects, "user-mismatch", and "Identity Mismatch (null)" crashes!
const secondaryAppSuffix = "omaxe-post-isolated-sync";
const secondaryApp = getApps().find(app => app.name === secondaryAppSuffix) 
  || initializeApp(firebaseConfig, secondaryAppSuffix);

const secondaryAuth = getAuth(secondaryApp);
const db = getFirestore(secondaryApp, "ai-studio-e12d6e76-8aa2-4bd4-96b2-ed235287a5c2");

// Production rules standard path appId
const appId = "omaxe-society-connect";

// Isolated Authentication Trigger (Satisfies Rule 3 on our isolated channel only)
const ensureSecondaryAuth = async () => {
  if (secondaryAuth.currentUser) return secondaryAuth.currentUser;
  
  try {
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
      const cred = await signInWithCustomToken(secondaryAuth, __initial_auth_token);
      return cred.user;
    } else {
      const cred = await signInAnonymously(secondaryAuth);
      return cred.user;
    }
  } catch (err) {
    console.error("Secondary sandbox auth handshake failed:", err);
    return null;
  }
};

// RULE 2 - In-Memory sorting wrapper (Prevents complex index query errors)
const sortPostsByDate = (postsArray: any[]) => {
  return postsArray.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA; // Newest first
  });
};

export const postService = {
  // 1. Fetch noticeboard posts securely using isolated database channel
  async getAllPosts() {
    await ensureSecondaryAuth();
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

  // 2. Real-time updates subscription sync using isolated channel (Will NEVER affect main Google login)
  subscribeToPosts(callback: (posts: any[]) => void) {
    let unsubscribe: (() => void) | null = null;

    ensureSecondaryAuth().then(() => {
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
        console.error("Firebase subscription error in isolated post service channel:", error);
      });
    }).catch((err) => {
      console.error("Auth initialization failed for subscription:", err);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  },

  // Parsing cleaner configuration
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

  // 3. Create post securely under standard database path
  async createPost(
    title: string, 
    content: string, 
    category: string, 
    authorName: string, 
    imageUrls: string[]
  ) {
    // Isolated channel active permission check
    const secondaryUser = await ensureSecondaryAuth();
    if (!secondaryUser) throw new Error("Secondary database handshake failed. Check configuration.");

    // Retrieve active resident's information if logged in on the primary application thread
    const currentUser = mainAuth.currentUser;

    const newPost = {
      title: title,
      content: content,
      category: category || 'general',
      status: 'pending', // Validation rule compliant initial status
      imageUrl: imageUrls.length > 0 ? imageUrls[0] : null,
      imageUrls: imageUrls,
      authorId: currentUser?.uid || secondaryUser.uid,
      authorName: authorName || currentUser?.displayName || "Resident",
      comments: [],
      createdAt: new Date().toISOString()
    };

    const postsRef = collection(db, 'artifacts', appId, 'public', 'data', 'posts');
    const docRef = await addDoc(postsRef, newPost);
    return { id: docRef.id, ...newPost };
  },

  // 4. Admin Action: Approve / Reject state update
  async updatePostStatus(postId: string, status: 'approved' | 'rejected') {
    await ensureSecondaryAuth();
    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
    await updateDoc(postRef, { status });
  },

  // 5. Admin Action: Delete Post
  async deletePost(postId: string) {
    await ensureSecondaryAuth();
    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
    await deleteDoc(postRef);
  },

  // 6. Isolated comments submission flow
  async addComment(postId: string, commentText: string) {
    const secondaryUser = await ensureSecondaryAuth();
    if (!secondaryUser) throw new Error("Secondary authorization failed. Cannot post comment.");

    const currentUser = mainAuth.currentUser;

    const newComment = {
      text: commentText,
      authorId: currentUser?.uid || secondaryUser.uid,
      authorName: currentUser?.displayName || "Resident",
      createdAt: new Date().toISOString()
    };

    const postRef = doc(db, 'artifacts', appId, 'public', 'data', 'posts', postId);
    await updateDoc(postRef, {
      comments: arrayUnion(newComment)
    });

    return newComment;
  }
};
