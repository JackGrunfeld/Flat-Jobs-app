import { Hono } from "hono";
import type { AppEnv } from "../types";

// The privacy policy, served as a plain public web page.
//
// App Store Connect requires a publicly reachable privacy policy URL before an
// app can be submitted, and TestFlight's external testing asks for the same
// one. It lives here rather than on a separate site because the API is already
// deployed, already public, and already the thing that holds the data being
// described — a policy served from the same origin as the data can't drift
// away from it into a marketing site nobody updates.
//
// The Terms deliberately aren't duplicated here: they're shipped inside the
// app (mobile/src/constants/terms.ts), shown at sign-up and readable any time
// from Settings, and a second copy would only get out of step with the first.
//
// NOTE: like the Terms, this is plain-language boilerplate written to describe
// what the app actually does. It has not been reviewed by a lawyer — get it
// reviewed before a public App Store release.
const legal = new Hono<AppEnv>();

// Keep in step with the Terms' own date when either changes materially.
const LAST_UPDATED = "18 August 2026";
// Matches the address already given in the in-app Terms (section 10), so
// there's one contact route rather than two. This mailbox has to actually
// exist and be monitored before submitting — App Review and data-rights
// requests both arrive through it.
const CONTACT_EMAIL = "support@flatr.app";

type Section = { heading: string; body: string[] };

const SECTIONS: Section[] = [
  {
    heading: "Who we are",
    body: [
      "Flatr is an app for people sharing a home — chores, a shared shopping list, splitting costs between flatmates, and a shared calendar. This policy explains what the app collects, why, and what you can do about it.",
      `If you have a question about any of it, email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.`,
    ],
  },
  {
    heading: "What we collect",
    body: [
      "<strong>Account details.</strong> Your email address, display name, date of birth and country. Date of birth is collected because the app has a minimum age and because flats show flatmates' birthdays on the shared calendar.",
      "<strong>Sign-in identity.</strong> If you sign in with Google or Apple, we store the identifier that provider gives us for you, so we can recognise you next time. We never receive or store your Google or Apple password.",
      "<strong>Password.</strong> If you sign up with an email and password, the password is stored only as a salted hash. We cannot read it.",
      "<strong>What you put in the app.</strong> Your flat and its members, chores and who completed them, shopping list items, expenses and how they were split, settle-up records, and calendar events.",
      "<strong>Device push token.</strong> If you turn on notifications, we store the token needed to send them to your device.",
    ],
  },
  {
    heading: "What we don't collect",
    body: [
      "No analytics, no advertising identifiers, no third-party trackers, no location, no contacts, no photos. We do not sell or share personal data with anyone for advertising, and there is no advertising in the app.",
      "Flatr does not hold, transfer or process money. Balances are a record of what your household has agreed between yourselves; actual payments happen outside the app.",
    ],
  },
  {
    heading: "Who can see your information",
    body: [
      "The other members of your flat can see your display name, your profile colour, your birthday, the chores assigned to you, the items you add, and the expenses and balances you are part of. Only join a flat with people you are happy to share that with.",
      "Nobody outside your flat can see your flat's data.",
    ],
  },
  {
    heading: "Who processes it for us",
    body: [
      "<strong>Cloudflare</strong> hosts the app's API and database.",
      "<strong>Expo</strong> delivers push notifications to your device, which means the notification is passed through Expo and then through Apple's or Google's push service.",
      "<strong>Resend</strong> sends flat invitation emails, which means an invited email address is passed to them for that purpose.",
      "<strong>Google and Apple</strong> handle sign-in if you choose to use it.",
      "These providers act on our behalf and only for the purposes above.",
    ],
  },
  {
    heading: "How long we keep it",
    body: [
      "Your data is kept for as long as your account exists. Sign-in sessions expire on their own and are cleared when you sign out.",
    ],
  },
  {
    heading: "Deleting your account",
    body: [
      "You can permanently delete your account from inside the app: <strong>Settings &rarr; Delete account</strong>. It is immediate and it cannot be undone.",
      "Deleting your account removes your profile, your sign-in identities, your sessions and push tokens, and everything you authored — the expenses you logged, the events you created, the list items you added, your chore completions, and your settle-up records. Any balance your flatmates were carrying with you disappears along with it, so settle up first if that matters.",
      "Your flat itself is not deleted, because it belongs to the people still in it — ownership passes to the next flatmate who joined. A flat with nobody left in it is deleted outright.",
      `If you would rather we did it for you, email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> from your account's address.`,
    ],
  },
  {
    heading: "Your rights",
    body: [
      `Depending on where you live, you may have the right to ask for a copy of your data, to have it corrected, or to have it erased. Deletion is built into the app as described above; for anything else, email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.`,
      "You must be at least 16 to use Flatr, and the app is not directed at children.",
    ],
  },
  {
    heading: "Changes",
    body: [
      "If this policy changes materially we will update the date at the top of this page and, where the change is significant, tell you in the app.",
    ],
  },
];

// Inlined rather than served from an asset: the Worker has no static asset
// binding, and the page is small enough that a single response beats adding
// one. Dark mode is handled with prefers-color-scheme so the page matches the
// phone it's opened on when it's reached from inside the app.
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Flatr — Privacy Policy</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f9f7f4;
    --surface: #ffffff;
    --text: #0a0a0b;
    --muted: #6b7280;
    --border: #d7d9df;
    --accent: #2563EB;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #040405;
      --surface: #15161a;
      --text: #ffffff;
      --muted: #9CA3AF;
      --border: #2c2f36;
      --accent: #ed4e04;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 40px 20px 80px;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
    line-height: 1.6;
  }
  main { max-width: 680px; margin: 0 auto; }
  h1 { font-size: 2rem; letter-spacing: -0.03em; margin: 0 0 4px; }
  .updated { color: var(--muted); font-size: 0.85rem; margin: 0 0 36px; }
  section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 20px 22px;
    margin-bottom: 14px;
  }
  h2 { font-size: 1.05rem; letter-spacing: -0.01em; margin: 0 0 10px; }
  p { margin: 0 0 12px; }
  p:last-child { margin-bottom: 0; }
  a { color: var(--accent); }
  footer { color: var(--muted); font-size: 0.85rem; text-align: center; margin-top: 32px; }
</style>
</head>
<body>
<main>
  <h1>Privacy Policy</h1>
  <p class="updated">Flatr · Last updated ${LAST_UPDATED}</p>
  ${SECTIONS.map(
    (section) => `<section>
    <h2>${section.heading}</h2>
    ${section.body.map((paragraph) => `<p>${paragraph}</p>`).join("\n    ")}
  </section>`,
  ).join("\n  ")}
  <footer>Flatr</footer>
</main>
</body>
</html>`;

legal.get("/privacy", (c) =>
  c.html(PAGE, 200, {
    // Long enough that the page isn't refetched on every open, short enough
    // that a correction is live the same day.
    "Cache-Control": "public, max-age=3600",
  }),
);

export default legal;
