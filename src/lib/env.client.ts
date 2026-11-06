//src/lib/env.client.ts
type ClientEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: string;
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: string;
  NEXT_PUBLIC_FIREBASE_APP_ID?: string;
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
};

export function getClientEnv(): { ok: boolean; env: Partial<ClientEnv>; missing: string[] } {
  const missing: string[] = [];

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey) missing.push("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!authDomain) missing.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (!projectId) missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");

  const env: ClientEnv = {
    NEXT_PUBLIC_FIREBASE_API_KEY: apiKey || "",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: authDomain || "",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId || "",
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  };

  return { ok: missing.length === 0, env, missing };
}
