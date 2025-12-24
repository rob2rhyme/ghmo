import { NextResponse } from "next/server";

export async function GET() {
  const env = process.env;
  return NextResponse.json({
    NEXT_PUBLIC_FIREBASE_API_KEY: Boolean(env.NEXT_PUBLIC_FIREBASE_API_KEY),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: Boolean(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: Boolean(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
  });
}
