import { createRemoteJWKSet, jwtVerify } from "jose";

const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export type AppleIdentity = {
  sub: string;
  email: string | null;
};

// Verifies an Apple `identityToken` (JWT). `allowedClientIds` is the
// comma-separated bundle ID + Services ID registered with Apple — Apple sets
// `aud` to whichever one initiated the request.
//
// Note: Apple's identityToken never carries the user's name, and only carries
// email on the FIRST authorization for a given user unless they've since
// changed their sharing preference. The client must capture `fullName`/`email`
// from expo-apple-authentication's response on that first call and forward it
// in the request body — this function only verifies the token's own claims.
export async function verifyAppleIdentityToken(
  identityToken: string,
  allowedClientIds: string,
): Promise<AppleIdentity> {
  const audience = allowedClientIds.split(",").map((s) => s.trim()).filter(Boolean);
  const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
    issuer: "https://appleid.apple.com",
    audience,
  });
  if (typeof payload.sub !== "string") {
    throw new Error("Apple token missing sub");
  }
  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
  };
}
