// Ported from frontend/src/utils/rosterHelpers.js — pure date/rotation math,
// framework-agnostic. `getAssignments` and the cleaningData-backed legacy
// roster logic were dead code in the web app (nothing called them) and are
// deliberately not ported.

export const baseDate = new Date(2026, 4, 4);

export function getCurrentWeek(): number {
  const today = new Date();
  const day = today.getDay(); // Sunday = 0

  const monday = new Date(today);
  monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day));

  const diffDays = Math.floor((monday.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7);
}

function getMonthIndexForWeek(weekIndex: number): number {
  const monday = new Date(baseDate);
  monday.setDate(monday.getDate() + weekIndex * 7);
  return (
    (monday.getFullYear() - baseDate.getFullYear()) * 12 + (monday.getMonth() - baseDate.getMonth())
  );
}

export type Frequency = "Daily" | "Weekly" | "Monthly";

export function getPeriodIndex(frequency: Frequency | string | undefined, weekIndex: number): number {
  switch ((frequency || "Weekly").toLowerCase()) {
    case "monthly":
      return getMonthIndexForWeek(weekIndex);
    case "daily":
      return weekIndex * 7;
    default:
      return weekIndex;
  }
}

export function getWeekDates(weekIndex: number): string {
  const start = new Date(baseDate);
  const day = start.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diffToMonday + weekIndex * 7);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const format = (date: Date) => date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" });

  return `${format(start)} – ${format(end)}`;
}
