export type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  GOOGLE_CLIENT_IDS: string; // comma-separated: web,ios,android client IDs
  APPLE_CLIENT_IDS: string; // comma-separated: bundle ID + services ID
  CORS_ORIGIN: string;
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
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

export function now(): number {
  return Date.now();
}
