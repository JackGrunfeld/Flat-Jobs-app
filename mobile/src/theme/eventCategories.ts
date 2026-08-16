import type { EventCategory, EventRecurrence } from "../types";

// What a calendar event is *about*, and how the calendar says so. A category
// is what turns a ring on the 1st from "something's on" into "rent's due" —
// so each one carries both a colour, which is what marks the day itself at the
// size those circles are, and an icon, which is what names it wherever there's
// room to draw one.
//
// Colours are fixed rather than themed: they sit on the calendar card's own
// dark plate in both schemes, and they're identity — a power day being yellow
// is the point of it, the same reasoning that keeps flatmates' own colours
// from inverting. All are light enough to read against that plate.
export type CategoryStyle = {
  label: string;
  color: string;
  // Ionicons name. Drawn in the banner and in the form's picker, where there's
  // room for it to be legible — a day circle is far too small for both an icon
  // and its date, so on the grid the colour does the identifying.
  icon: string;
};

export const EVENT_CATEGORIES: Record<EventCategory, CategoryStyle> = {
  rent: { label: "Rent", color: "#ff8fa3", icon: "home" },
  power: { label: "Power", color: "#ffd166", icon: "flash" },
  internet: { label: "Internet", color: "#7cc6ff", icon: "wifi" },
  water: { label: "Water", color: "#6fd6d2", icon: "water" },
  rubbish: { label: "Rubbish", color: "#a8d86f", icon: "trash" },
  social: { label: "Social", color: "#c9a7ff", icon: "beer" },
};

// Fixed order for the picker, so the chips don't shuffle between renders the
// way Object.keys on a record built elsewhere might.
export const CATEGORY_ORDER: EventCategory[] = [
  "rent",
  "power",
  "internet",
  "water",
  "rubbish",
  "social",
];

// The categories that are money owed to someone outside the flat, as opposed
// to the ones that are just things happening. This is what the dashboard's
// bills card counts — rubbish night and a games night are on the calendar too,
// and neither is a bill.
export const BILL_CATEGORIES: EventCategory[] = ["rent", "power", "internet", "water"];

export const isBillCategory = (category: EventCategory | null): boolean =>
  category !== null && BILL_CATEGORIES.includes(category);

export const RECURRENCE_LABELS: Record<EventRecurrence, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export const RECURRENCE_ORDER: EventRecurrence[] = ["weekly", "fortnightly", "monthly", "yearly"];

// How a repeating event says so in a sentence: "Rent · every month".
export const recurrenceCaption = (recurrence: EventRecurrence): string =>
  ({
    weekly: "every week",
    fortnightly: "every fortnight",
    monthly: "every month",
    yearly: "every year",
  })[recurrence];
