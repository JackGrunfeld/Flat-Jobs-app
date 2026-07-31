export type User = {
  id: string;
  email: string;
  displayName: string;
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

export type ShoppingItem = {
  id: string;
  name: string;
  costCents: number;
  addedByUserId: string;
  splitWith: string[];
  createdAt: number;
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
