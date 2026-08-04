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
