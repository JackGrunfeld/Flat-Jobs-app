export type User = {
  id: string;
  email: string;
  displayName: string;
  birthday: string | null;
};

export type FlatMember = {
  userId: string;
  displayName: string;
  color: string | null;
  // Set at signup. Feeds the home screen calendar's automatic birthday
  // events — see utils/calendarEvents.ts.
  birthday: string | null;
};

// A row on the flat's communal calendar. Wall-clock date/time rather than an
// epoch, so an arrangement doesn't drift for a flatmate in another timezone.
// A null `time` means all-day.
export type EventRecurrence = "weekly" | "fortnightly" | "monthly" | "yearly";
export type EventCategory = "rent" | "power" | "internet" | "water" | "rubbish" | "social";

export type FlatEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD, first day
  // Inclusive last day of a multi-day event. Null when it starts and ends the
  // same day — the server normalises an end equal to the start down to null,
  // so a span is real whenever this is set.
  endDate: string | null;
  time: string | null; // HH:MM, 24-hour
  // The rule, not the dates. Null happens once; otherwise the event repeats
  // from `date` forever, and which days that lands on is worked out per window
  // by utils/calendarEvents.ts.
  recurrence: EventRecurrence | null;
  category: EventCategory | null;
  createdBy: string;
  createdAt: number;
};

export type NewFlatEvent = {
  title: string;
  date: string;
  endDate: string | null;
  time: string | null;
  recurrence: EventRecurrence | null;
  category: EventCategory | null;
};

// A single dated thing the home screen calendar knows about, from either
// source: `birthday` entries are derived client-side from members' signup
// birthdates, `event` entries are rows someone added to the communal calendar.
export type CalendarEventKind = "birthday" | "event";

export type CalendarEvent = {
  id: string;
  date: string; // YYYY-MM-DD, local time
  title: string;
  kind: CalendarEventKind;
  color: string | null;
  time: string | null; // null for all-day (and always null for birthdays)
  category: EventCategory | null;
  // Carried through from the rule so the banner can say "every month" — the
  // expanded days themselves are just dates and would otherwise have no way
  // of knowing they came from a series.
  recurrence: EventRecurrence | null;
  // One entry per day an event covers, so the grid can mark every day of a
  // span. `isStart` picks out the one day that represents the occurrence
  // itself — what the banner announces, and what "next up" counts.
  isStart: boolean;
  // Days in the span, 1 for an ordinary single-day event.
  spanDays: number;
};

export type Flat = {
  id: string;
  name: string;
  code: string;
  ownerId: string;
  members: FlatMember[];
  invitedEmails: string[];
};

export type Frequency = "Daily" | "Weekly" | "Monthly";

export type Chore = {
  id: string;
  name: string;
  description: string | null;
  frequency: Frequency;
  memberIds: string[];
  createdAt: number;
};

export type Completion = {
  choreId: string;
  week: number;
  assignedUserId: string;
  done: boolean;
};

export type ShoppingCategory = "Food" | "Utilities" | "Household" | "Other";

// A Splitwise-style expense: cost + split required. Deliberately separate
// from ShoppingListItem below — see ShoppingScreen's List/Splitwise split.
export type ShoppingItem = {
  id: string;
  name: string;
  costCents: number;
  addedByUserId: string;
  category: ShoppingCategory;
  splitWith: string[];
  createdAt: number;
};

// The plain shared "need to buy this" checklist — no cost, no split.
export type ShoppingListItem = {
  id: string;
  name: string;
  addedByUserId: string;
  purchased: boolean;
  createdAt: number;
  upvoteCount: number;
  upvotedByUserIds: string[];
};

export type Balance = {
  userId: string;
  owesUserId: string;
  amountCents: number;
};

export type Settlement = {
  id: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  note: string | null;
  createdAt: number;
};
