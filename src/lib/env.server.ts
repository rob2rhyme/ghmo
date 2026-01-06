import { z } from "zod";

if (typeof window !== "undefined") {
  throw new Error("env.server imported on client");
}

const featureSchema = z.object({
  GOFUNDME_PRO_WEBHOOK_SECRET: z.string().optional(),
  GOFUNDME_PRO_CLIENT_ID: z.string().optional(),
  GOFUNDME_PRO_CLIENT_SECRET: z.string().optional(),
  GOFUNDME_PRO_API_BASE: z.string().default("https://api.gofundme.com"),
  APP_ENV: z.string().default("dev"),
  FEATURE_EMAIL_ADMIN_LOGIN: z
    .preprocess(val => val === "true" || val === true, z.boolean())
    .default(false),
  FEATURE_PIN_LOGIN: z
    .preprocess(val => (val === "false" ? false : val === "true" || val === true), z.boolean())
    .default(true),
  ALLOW_DEV_ADMIN_LOGIN: z
    .preprocess(val => val === "true" || val === true, z.boolean())
    .default(false),
  DEV_ADMIN_LOGIN_TOKEN: z.string().optional()
});

const adminSchema = z.object({
  FIREBASE_ADMIN_PROJECT_ID: z.string().min(1, "FIREBASE_ADMIN_PROJECT_ID is required"),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().min(1, "FIREBASE_ADMIN_CLIENT_EMAIL is required"),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(1, "FIREBASE_ADMIN_PRIVATE_KEY is required")
});

const adminEnvKeys = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY"
] as const;

type FeatureEnv = z.infer<typeof featureSchema>;
type AdminEnvOnly = z.infer<typeof adminSchema>;
export type FullServerEnv = FeatureEnv & AdminEnvOnly;

const rawFeatureInput = () => ({
  GOFUNDME_PRO_WEBHOOK_SECRET: process.env.GOFUNDME_PRO_WEBHOOK_SECRET,
  GOFUNDME_PRO_CLIENT_ID: process.env.GOFUNDME_PRO_CLIENT_ID,
  GOFUNDME_PRO_CLIENT_SECRET: process.env.GOFUNDME_PRO_CLIENT_SECRET,
  GOFUNDME_PRO_API_BASE: process.env.GOFUNDME_PRO_API_BASE,
  APP_ENV: process.env.APP_ENV,
  FEATURE_EMAIL_ADMIN_LOGIN: process.env.FEATURE_EMAIL_ADMIN_LOGIN,
  FEATURE_PIN_LOGIN: process.env.FEATURE_PIN_LOGIN,
  ALLOW_DEV_ADMIN_LOGIN: process.env.ALLOW_DEV_ADMIN_LOGIN,
  DEV_ADMIN_LOGIN_TOKEN: process.env.DEV_ADMIN_LOGIN_TOKEN
});

let cachedFeatureEnv: FeatureEnv | null = null;
let cachedFullEnv: FullServerEnv | null = null;

export class AdminEnvError extends Error {
  constructor(public readonly issues: string[], cause?: unknown) {
    super(
      `Admin-only functionality requires Firebase admin environment variables (${issues.join(
        ", "
      )}). Define FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY before accessing admin routes.`,
      { cause }
    );
    this.name = "AdminEnvError";
  }
}

export function getServerEnv(): FeatureEnv {
  if (cachedFeatureEnv) return cachedFeatureEnv;
  cachedFeatureEnv = featureSchema.parse(rawFeatureInput());
  return cachedFeatureEnv;
}

export function getAdminServerEnv(): FullServerEnv {
  if (cachedFullEnv) return cachedFullEnv;
  const adminInput = {
    FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID,
    FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n")
  };
  try {
    const adminEnv = adminSchema.parse(adminInput);
    cachedFullEnv = { ...getServerEnv(), ...adminEnv };
    return cachedFullEnv;
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.errors.map(error => error.path.join(".") || "server env");
      throw new AdminEnvError(issues, err);
    }
    throw err;
  }
}
