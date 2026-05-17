import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
// Use the firestoreDatabaseId from the config if available, otherwise default
// Enable long polling to bypass potential websocket issues in the runtime environment
const settings = {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
  ignoreUndefinedProperties: true
};

const databaseId = (firebaseConfig as any).firestoreDatabaseId;

// Initialize Firestore with settings
// If databaseId is provided and not '(default)', use it.
export const db = (databaseId && databaseId !== '(default)') 
  ? initializeFirestore(app, settings, databaseId)
  : initializeFirestore(app, settings);

export const auth = getAuth(app);

// Error Handling Utility
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Critical Connection Test
async function testConnection() {
  try {
    // Attempt to fetch a non-existent document to trigger a network request
    await getDocFromServer(doc(db, '_connection_test', 'test'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('unavailable')) {
      console.error("Firestore connection unavailable. This may be a temporary network issue.");
    } else {
      // Expected failure if document doesn't exist, but confirms connectivity
    }
  }
}

testConnection();
