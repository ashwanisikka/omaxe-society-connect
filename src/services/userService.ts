import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';

export const userService = {
  subscribeToUsers: (callback: (users: UserProfile[]) => void) => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(doc => ({
        ...doc.data(),
        uid: doc.id
      })) as UserProfile[];
      callback(users);
    }, (error) => {
      console.error("Error subscribing to users:", error);
    });
  },

  updateUserRole: async (userId: string, role: UserRole) => {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { role });
  },

  deleteUser: async (userId: string) => {
    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'users', userId));
  },

  toggleBlockUser: async (userId: string, isBlocked: boolean) => {
    await updateDoc(doc(db, 'users', userId), { isBlocked });
  }
};
