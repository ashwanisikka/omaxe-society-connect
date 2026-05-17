import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Post, PostCategory, PostStatus } from '../types';

export const postService = {
  async createPost(title: string, content: string, category: PostCategory, authorName: string, imageUrls?: string[]) {
    const path = 'posts';
    try {
      if (!auth.currentUser) throw new Error("Not authenticated");
      const postData = {
        authorId: auth.currentUser.uid,
        authorName,
        title,
        content,
        imageUrls: imageUrls || [],
        category,
        status: 'pending',
        createdAt: serverTimestamp(),
      };
      return await addDoc(collection(db, path), postData);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async updatePostStatus(postId: string, status: PostStatus) {
    const path = `posts/${postId}`;
    try {
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, { 
        status, 
        updatedAt: serverTimestamp() 
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deletePost(postId: string) {
    const path = `posts/${postId}`;
    try {
      await deleteDoc(doc(db, 'posts', postId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  subscribeToPosts(callback: (posts: Post[]) => void, filters?: { category?: PostCategory, status?: PostStatus }) {
    const path = 'posts';
    let q = query(collection(db, path), orderBy('createdAt', 'desc'));

    if (filters?.status) {
      q = query(q, where('status', '==', filters.status));
    }
    if (filters?.category) {
      q = query(q, where('category', '==', filters.category));
    }

    return onSnapshot(q, (snapshot) => {
      const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
      callback(posts);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
  },

  async addComment(postId: string, content: string, authorName: string) {
    const path = `posts/${postId}/comments`;
    try {
      if (!auth.currentUser) throw new Error("Not authenticated");
      const commentData = {
        postId,
        authorId: auth.currentUser.uid,
        authorName,
        content,
        createdAt: serverTimestamp(),
      };
      return await addDoc(collection(db, path), commentData);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  subscribeToComments(postId: string, callback: (comments: any[]) => void) {
    const path = `posts/${postId}/comments`;
    const q = query(collection(db, path), orderBy('createdAt', 'asc'));

    return onSnapshot(q, (snapshot) => {
      const comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(comments);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
  },

  async deleteComment(postId: string, commentId: string) {
    const path = `posts/${postId}/comments/${commentId}`;
    try {
      await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
};
