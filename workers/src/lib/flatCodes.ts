import type { D1Database } from "@cloudflare/workers-types";

// Ported from frontend/src/services/flatService.js — omits 0/O, 1/I/L to avoid
// visually ambiguous invite codes.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export async function uniqueFlatCode(db: D1Database): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    const existing = await db.prepare("SELECT 1 FROM flats WHERE code = ?").bind(code).first();
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique flat code. Try again.");
}
