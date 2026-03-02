// utils/rosterHelper.js
import { flatmates, tasks, bathroomAUsers, bathroomBUsers } from "../Data/cleaningData";

export const baseDate = new Date(); // first Monday of rotation

// ------------ WEEK CALCULATION -------------
export function getCurrentWeek() {
  const today = new Date();
  const day = today.getDay(); // Sunday = 0

  const monday = new Date(today);
  monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day));

  const diffDays = Math.floor((monday - baseDate) / (1000 * 60 * 60 * 24));

  return Math.floor(diffDays / 7);
}

// ------------ ASSIGNMENT LOGIC -------------
export function getAssignments(week) {
  const assignments = {};

  tasks.forEach((task, index) => {
    const person = flatmates[(week + index) % flatmates.length];
    assignments[task] = person;
  });

  const largeJobs = ["Clean the Kitchen", "Clean the Fridge"];

  const bathroomACandidates = bathroomAUsers.filter(
    (person) => !largeJobs.some((job) => assignments[job] === person)
  );

  const bathroomAcleaner =
    bathroomACandidates.length > 0
      ? bathroomACandidates[week % bathroomACandidates.length]
      : bathroomAUsers[week % bathroomAUsers.length];

  assignments["Clean Bathroom A (Holly, Molly, Josh)"] = bathroomAcleaner;

  assignments["Clean Bathroom B (Jack, Finn)"] =
    bathroomBUsers[week % bathroomBUsers.length];

  return assignments;
}

// ------------ WEEK RANGE DISPLAY -------------
export function getWeekDates(weekIndex) {
  const start = new Date(baseDate);
  const day = start.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  start.setDate(start.getDate() + diffToMonday + weekIndex * 7);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  // Format: DD/MM
  const format = (date) =>
    date
      .toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" })
      .replace(/\//g, "/");

  return `${format(start)} – ${format(end)}`;
}