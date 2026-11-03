//src/lib/firebaseClient.ts
//
// Firebase app + Auth only. Firestore lives in ./firebaseFirestore so that pages which only need Auth
// (sign-in, sign-out) never download the Firestore SDK; public pages import neither at module level.
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, inMemoryPersistence, initializeAuth, type Auth } from "firebase/auth";
import { getClientEnv } from "./env.client";

let firebaseInitError: string | null = null;
let missingEnvKeys: string[] = [];
let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

/** True on localhost with NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true: talk to the local Firebase emulators. */
export function shouldUseFirebaseEmulators(): boolean {
  if (typeof window === "undefined") return false;
  // Ignored on any non-localhost origin, so a mis-set flag can never redirect a deployed site's traffic.
  const onLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  return onLocalhost && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
}

/**
 * Auth that keeps its sign-in in memory only, so it ends with the tab. The site's sessions are the server's
 * 8-hour cookie; a sign-in saved in the browser could otherwise keep minting tokens long after that.
 */
function memoryOnlyAuth(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, { persistence: inMemoryPersistence });
  } catch {
    // Already initialized (for example after a hot reload): reuse it.
    return getAuth(app);
  }
}

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

  firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const isFirstInit = !firebaseAuth;
  firebaseAuth = firebaseAuth ?? memoryOnlyAuth(firebaseApp);

  if (isFirstInit && shouldUseFirebaseEmulators()) {
    connectAuthEmulator(firebaseAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
}

try {
  if (typeof window !== "undefined") {
    initFirebaseClients();
  }
} catch (err: any) {
  firebaseInitError = err?.message || "Missing Firebase web config";
  firebaseApp = null;
  firebaseAuth = null;
}

function ensureInit() {
  if (typeof window === "undefined") {
    throw new Error("Firebase client is client-only");
  }
  if (firebaseApp && firebaseAuth) return;
  if (firebaseInitError) {
    throw new Error(firebaseInitError || "Firebase init error");
  }
  try {
    initFirebaseClients();
  } catch (err: any) {
    firebaseInitError = err?.message || "Missing Firebase web config";
    throw new Error(firebaseInitError || "Firebase init error");
  }
}

/** The initialised Firebase app (browser only); other SDK modules (Firestore) are created from it. */
export function getFirebaseApp(): FirebaseApp {
  ensureInit();
  if (!firebaseApp) {
    throw new Error("Firebase app is unavailable");
  }
  return firebaseApp;
}

export function getFirebaseAuth(): Auth {
  ensureInit();
  if (!firebaseAuth) {
    throw new Error("Firebase Auth is unavailable");
  }
  return firebaseAuth;
}

export { firebaseInitError, missingEnvKeys };
