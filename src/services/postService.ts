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

const db = getFirestore();
const auth = getAuth();

export const postService = {
  // 1. Sabhi society noticeboard posts ko naye se purane ke order mein fetch karta hai
  async getAllPosts() {
    const postsRef = collection(db, 'posts');
    const q = query(postsRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const posts: any[] = [];
    querySnapshot.forEach((doc) => {
      posts.push({ id: doc.id, ...doc.data() });
    });
    return posts;
  },

  // 2. Real-time dashboard updates ke liye live stream listener
  subscribeToPosts(callback: (posts: any[]) => void) {
    const postsRef = collection(db, 'posts');
    const q = query(postsRef, orderBy('createdAt', 'desc'));
    
    // Jab bhi naya post add hota hai, ye automatic dashboard par updates push karta hai
    return onSnapshot(q, (snapshot) => {
      const posts: any[] = [];
      snapshot.forEach((doc) => {
        posts.push({ id: doc.id, ...doc.data() });
      });
      callback(posts);
    }, (error) => {
      console.error("Firebase subscription error:", error);
    });
  },

  // AI JSON responses ko safely parse karne ke liye helper function jo markdown backticks ko saaf karta hai
  cleanAndParseJSON(rawResponse: string) {
    try {
      let cleanString = rawResponse.trim();
      // Agar shuruat mein markdown block indicators hain toh unhe remove karein
      if (cleanString.startsWith("```")) {
        cleanString = cleanString.replace(/^
