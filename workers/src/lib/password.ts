// Web Crypto PBKDF2 password hashing. Workers has no bcrypt/argon2 (no native
// bindings), so PBKDF2-SHA256 via crypto.subtle is the standard fit.
// 100,000 is the actual ceiling: the Workers runtime's PBKDF2 implementation
// rejects iteration counts above 100,000 (confirmed via a live deploy — OWASP's
// usual 210k+ recommendation assumes no such platform cap).
const ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;

function toBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
}

export async function hashPassword(password: string): Promise<{
  hash: string;
  salt: string;
  iterations: number;
}> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const derived = await deriveBits(password, saltBytes, ITERATIONS);
  return {
    hash: toBase64(derived),
    salt: toBase64(saltBytes.buffer),
    iterations: ITERATIONS,
  };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
  iterations: number,
): Promise<boolean> {
  const derived = await deriveBits(password, fromBase64(storedSalt), iterations);
  const candidate = toBase64(derived);
  // Constant-time comparison to avoid timing side-channels.
  if (candidate.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}
