//src/lib/firebaseFirestore.ts
//
// The Firestore client, created from the app in ./firebaseClient. Import this only from the pages that
// read Firestore live (admin chat, plans & issues, action items): it pulls the Firestore SDK (~100 KB gz)
// into whichever route bundle imports it, so public pages and the sign-in page must not.
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { firebaseInitError, getFirebaseApp, shouldUseFirebaseEmulators } from "./firebaseClient";

function initFirestore(): Firestore | null {
  if (typeof window === "undefined") return null;
  try {
    const db = getFirestore(getFirebaseApp());
    if (shouldUseFirebaseEmulators()) {
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }
    return db;
  } catch {
    // firebaseInitError (re-exported below) says what is missing.
    return null;
  }
}

/** Firestore, or null when the Firebase web config is missing (then `firebaseInitError` says why). */
export const firestore: Firestore | null = initFirestore();

export { firebaseInitError };
