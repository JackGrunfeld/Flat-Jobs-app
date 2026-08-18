// Terms & Conditions shown on the sign-up screen, before an account exists.
//
// NOTE: this is plain-language boilerplate written to describe what the app
// actually does — it has NOT been reviewed by a lawyer. Get it reviewed before
// a public App Store release, and keep TERMS_VERSION in step with the server's
// CURRENT_TERMS_VERSION (workers/src/routes/auth.ts) whenever it changes
// materially, so existing users get re-prompted.
export const TERMS_VERSION = "1.0";

export const TERMS_LAST_UPDATED = "17 August 2026";

export type TermsSection = { heading: string; body: string };

export const TERMS_SECTIONS: TermsSection[] = [
  {
    heading: "1. About Flatr",
    body:
      "Flatr is an app for people sharing a home. It helps your household track chores, keep a shared shopping list, split costs between flatmates, and keep a shared calendar. Flatr is an organisational tool only — it does not hold, transfer, or process money, and it is not a payment service.",
  },
  {
    heading: "2. Your account",
    body:
      "You must be at least 16 years old to create an account. You are responsible for keeping your login details secure and for everything done through your account. Give us accurate information when you sign up, and keep it up to date.",
  },
  {
    heading: "3. Your flat and what others can see",
    body:
      "When you join a flat, the other members of that flat can see your display name, your profile colour, your birthday, the chores assigned to you, the items you add, and the expenses and balances you are part of. Only join flats with people you are happy to share that with. Leaving a flat stops any further sharing, but does not delete records of past shared activity from that flat's history.",
  },
  {
    heading: "4. Expenses and settling up",
    body:
      "Balances and settle-up amounts in Flatr are a record of what your household has agreed between yourselves. They are calculated from what you and your flatmates enter. We do not verify these amounts, and we are not a party to any agreement or debt between you and your flatmates. Any actual payments happen outside Flatr, and disputes are between you and them.",
  },
  {
    heading: "5. Acceptable use",
    body:
      "Do not use Flatr to harass anyone, to post unlawful or abusive content, to impersonate someone else, or to try to gain access to accounts, flats, or data that are not yours. We may suspend or remove accounts that do.",
  },
  {
    heading: "6. Notifications",
    body:
      "If you allow it, Flatr sends push notifications — for example when a chore is completed or a flatmate settles up with you. You can turn these off at any time in your device settings.",
  },
  {
    heading: "7. Your data",
    body:
      "We store the information you give us and the activity you record in the app so that the app works. We do not sell your personal information, and we do not use it for advertising or tracking across other apps. You can ask us to delete your account and its data by contacting us at the address below.",
  },
  {
    heading: "8. Availability",
    body:
      "Flatr is provided as-is. We do our best to keep it running and your data intact, but we cannot promise the service will be uninterrupted or error-free. Keep your own record of anything you cannot afford to lose.",
  },
  {
    heading: "9. Liability",
    body:
      "To the extent the law allows, we are not liable for indirect or consequential loss arising from your use of Flatr, including any dispute, unpaid amount, or disagreement between you and your flatmates. Nothing here limits rights you have under consumer law that cannot be excluded.",
  },
  {
    heading: "10. Changes and contact",
    body:
      "We may update these terms. If we make a material change we will ask you to accept the new version in the app. Questions? Contact us at support@flatr.app.",
  },
];
