//src/lib/firebaseClient.ts
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getClientEnv } from "./env.client";

let firebaseInitError: string | null = null;
let missingEnvKeys: string[] = [];
let firebaseAuth: ReturnType<typeof getAuth> | null = null;
let firestore: ReturnType<typeof getFirestore> | null = null;

try {
  const { ok, env, missing } = getClientEnv();
  missingEnvKeys = missing;
  if (ok) {
    const firebaseConfig = {
      apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY!,
      authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
      projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
      storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.NEXT_PUBLIC_FIREBASE_APP_ID
    };

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    firebaseAuth = getAuth(app);
    firestore = getFirestore(app);
  } else {
    firebaseInitError = `Missing required environment variables: ${missing.join(", ")}`;
  }
} catch (err: any) {
  firebaseInitError = err?.message || "Missing Firebase web config";
  firebaseAuth = null;
  firestore = null;
}

export { firebaseAuth, firestore, firebaseInitError, missingEnvKeys };
