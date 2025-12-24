//src/lib/firebaseClient.ts
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getClientEnv } from "./env.client";

let firebaseInitError: string | null = null;
let missingEnvKeys: string[] = [];
let firebaseAuth: ReturnType<typeof getAuth> | null = null;
let firestore: ReturnType<typeof getFirestore> | null = null;

function initFirebaseClients() {
  const { ok, env, missing } = getClientEnv();
  missingEnvKeys = missing;
  if (!ok) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const firebaseConfig = {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID
  };

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  firebaseAuth = firebaseAuth ?? getAuth(app);
  firestore = firestore ?? getFirestore(app);
}

try {
  if (typeof window !== "undefined") {
    initFirebaseClients();
  }
} catch (err: any) {
  firebaseInitError = err?.message || "Missing Firebase web config";
  firebaseAuth = null;
  firestore = null;
}

export function getFirebaseAuth(): Auth {
  if (typeof window === "undefined") {
    throw new Error("Firebase Auth is client-only");
  }
  if (firebaseAuth) return firebaseAuth;
  if (firebaseInitError) {
    throw new Error(firebaseInitError || "Firebase init error");
  }

  try {
    initFirebaseClients();
  } catch (err: any) {
    firebaseInitError = err?.message || "Missing Firebase web config";
    throw new Error(firebaseInitError || "Firebase init error");
  }

  if (!firebaseAuth) {
    throw new Error("Firebase Auth is unavailable");
  }
  return firebaseAuth;
}

export { firestore, firebaseInitError, missingEnvKeys };
