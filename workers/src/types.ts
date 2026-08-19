export type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  GOOGLE_CLIENT_IDS: string; // comma-separated: web,ios,android client IDs
  APPLE_CLIENT_IDS: string; // comma-separated: bundle ID + services ID
  CORS_ORIGIN: string;
  // IANA zone the morning chore digests are timed against. See lib/choreDigest.
  NOTIFY_TIMEZONE?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};

export type Variables = {
  userId: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};

export class HttpError extends Error {
  status: number;
  // Machine-readable discriminator for the cases where the client has to
  // branch on *which* error it was rather than just show the message —
  // currently only TERMS_REQUIRED, which drives the sign-up terms prompt.
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

export function now(): number {
  return Date.now();
}
