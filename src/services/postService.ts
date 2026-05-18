import { 
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
import { db, auth } from '../lib/firebase';

export const postService = {
  // 1. Database ke root level 'posts' collection se saari posts naye se purane order mein fetch karta hai
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
        status: data.status || 'pending',
        imageUrls: data.imageUrls || (data.imageUrl ? [data.imageUrl] : []),
        comments: data.comments || []
      });
    });
    return posts;
  },

  // 2. Real-time updates listen karne ke liye subscription active karta hai
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
      console.error("Firebase subscription error in posts collection:", error);
    });
  },

  // AI response clean parser helper
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
      console.error("Failed to parse JSON config:", e);
      try {
        return JSON.parse(rawResponse);
      } catch (innerError) {
        throw new Error("Invalid structure configuration received.");
      }
    }
  },

  // 3. Central session database write call (Bina timing conflict ke post save karega)
  async createPost(
    title: string, 
    content: string, 
    category: string, 
    authorName: string, 
    imageUrls: string[]
  ) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("Post upload failed: Active resident session not found. Please reload the page.");
    }

    const newPost = {
      title: title,
      content: content,
      category: category || 'general',
      status: 'pending', // Validation rule compliant default state for moderation
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

  // 4. Admin action: Post approve/reject status change handler
  async updatePostStatus(postId: string, status: 'approved' | 'rejected') {
    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, { status });
  },

  // 5. Admin action: Post delete handler
  async deletePost(postId: string) {
    const postRef = doc(db, 'posts', postId);
    await deleteDoc(postRef);
  },

  // 6. Comments collection updates array integration
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
