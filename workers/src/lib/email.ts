// Sends flat-invite emails server-side, replacing the old client-only
// @emailjs/browser usage (which can't run in a Worker). Using Resend's HTTP
// API rather than Cloudflare Email Service: Cloudflare's send_email binding is
// built around routing to pre-verified destination addresses, which doesn't
// fit sending to arbitrary invitee emails without per-recipient verification.
// Resend needs no special binding, just a Workers Secret (RESEND_API_KEY).
export async function sendFlatInviteEmail(
  env: { RESEND_API_KEY?: string; RESEND_FROM_EMAIL?: string },
  params: { toEmail: string; flatName: string; flatCode: string; inviterName: string },
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.warn("[email] RESEND_API_KEY/RESEND_FROM_EMAIL not configured, skipping send");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: params.toEmail,
      subject: `${params.inviterName} invited you to join "${params.flatName}" on Flat Jobs`,
      html: `
        <p>${params.inviterName} invited you to join their flat, <strong>${params.flatName}</strong>, on Flat Jobs.</p>
        <p>Open the app and enter this code to join:</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:2px;">${params.flatCode}</p>
      `,
    }),
  });

  if (!res.ok) {
    console.error("[email] Resend send failed:", res.status, await res.text());
  }
}
