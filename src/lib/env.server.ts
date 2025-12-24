import { z } from "zod";

if (typeof window !== "undefined") {
  throw new Error("env.server imported on client");
}

const serverSchema = z.object({
  FIREBASE_ADMIN_PROJECT_ID: z.string().min(1, "FIREBASE_ADMIN_PROJECT_ID is required"),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().min(1, "FIREBASE_ADMIN_CLIENT_EMAIL is required"),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(1, "FIREBASE_ADMIN_PRIVATE_KEY is required"),
  GOFUNDME_PRO_WEBHOOK_SECRET: z.string().optional(),
  GOFUNDME_PRO_CLIENT_ID: z.string().optional(),
  GOFUNDME_PRO_CLIENT_SECRET: z.string().optional(),
  GOFUNDME_PRO_API_BASE: z.string().default("https://api.gofundme.com"),
  APP_ENV: z.string().default("dev")
});

export const serverEnv = serverSchema.parse({
  FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID,
  FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  GOFUNDME_PRO_WEBHOOK_SECRET: process.env.GOFUNDME_PRO_WEBHOOK_SECRET,
  GOFUNDME_PRO_CLIENT_ID: process.env.GOFUNDME_PRO_CLIENT_ID,
  GOFUNDME_PRO_CLIENT_SECRET: process.env.GOFUNDME_PRO_CLIENT_SECRET,
  GOFUNDME_PRO_API_BASE: process.env.GOFUNDME_PRO_API_BASE,
  APP_ENV: process.env.APP_ENV
});
