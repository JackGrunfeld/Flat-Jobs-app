import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type GoogleIdentity = {
  sub: string;
  email: string;
  name: string;
};

// Verifies a Google ID token client-obtained via expo-auth-session (PKCE code
// flow). `allowedClientIds` is the comma-separated web/iOS/Android OAuth
// client IDs registered in Google Cloud Console — any one of them is a valid
// `aud`, since the same backend serves all platforms.
export async function verifyGoogleIdToken(
  idToken: string,
  allowedClientIds: string,
): Promise<GoogleIdentity> {
  const audience = allowedClientIds.split(",").map((s) => s.trim()).filter(Boolean);
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience,
  });
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("Google token missing sub/email");
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: typeof payload.name === "string" ? payload.name : payload.email.split("@")[0],
  };
}
