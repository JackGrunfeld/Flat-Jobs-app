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
export type FlatEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM, 24-hour
  createdBy: string;
  createdAt: number;
};

export type NewFlatEvent = {
  title: string;
  date: string;
  time: string | null;
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
