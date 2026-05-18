import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// 1. Central Firebase project settings configuration
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

// Custom Named Database connection restoration
const db = getFirestore(app, "ai-studio-e12d6e76-8aa2-4bd4-96b2-ed235287a5c2");
const storage = getStorage(app);

// COMPATIBILITY FIX: Restore OperationType enum for AuthContext
export enum OperationType {
  READ = 'READ',
  WRITE = 'WRITE',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

// COMPATIBILITY FIX: Restore handleFirestoreError utility for AuthContext
export const handleFirestoreError = (error: any, operation: string = 'operation') => {
  console.error(`Firestore error during ${operation}:`, error);
  return error;
};

export { app, auth, db, storage };
