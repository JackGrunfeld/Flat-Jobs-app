import type { FlatMember } from "../types";

// First name only — the roster and balance cards set the name large and
// chunky, so a full name would wrap. Falls back to "First L." when two
// flatmates share a first name.
export function buildDisplayNames(members: FlatMember[]): Record<string, string> {
  const firsts = members.map((m) => (m.displayName || "").trim().split(/\s+/)[0] || m.displayName);
  const out: Record<string, string> = {};
  members.forEach((m) => {
    const parts = (m.displayName || "").trim().split(/\s+/);
    const first = parts[0] || m.displayName;
    const duplicated = firsts.filter((n) => n === first).length > 1;
    out[m.userId] = duplicated && parts.length > 1 ? `${first} ${parts[1][0].toUpperCase()}.` : first;
  });
  return out;
}
