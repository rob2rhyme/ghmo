import "server-only";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminServerEnv } from "./env.server";

let cachedApp: ReturnType<typeof initializeApp> | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

function getOrInitializeApp() {
  if (cachedApp) return cachedApp;
  const existingApps = getApps();
  if (existingApps.length) {
    cachedApp = existingApps[0];
    return cachedApp;
  }
  const env = getAdminServerEnv();
  cachedApp = initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY
    })
  });
  return cachedApp;
}

export function getAdminAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  cachedAuth = getAuth(getOrInitializeApp());
  return cachedAuth;
}

export function getAdminDb(): Firestore {
  if (cachedDb) return cachedDb;
  cachedDb = getFirestore(getOrInitializeApp());
  return cachedDb;
}
