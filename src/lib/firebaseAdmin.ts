import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { serverEnv } from "./env.server";

const app =
  getApps().length === 0
    ? initializeApp({
        credential: cert({
          projectId: serverEnv.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: serverEnv.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: serverEnv.FIREBASE_ADMIN_PRIVATE_KEY
        })
      })
    : getApps()[0];

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
