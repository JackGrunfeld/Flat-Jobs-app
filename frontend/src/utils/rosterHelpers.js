// utils/rosterHelper.js
import { flatmates, tasks, bathroomAUsers, bathroomBUsers } from "../Data/cleaningData";

export const baseDate = new Date(); // first Monday of rotation

// Mapping full task names to short locations
const taskLocations = {
  "Clean the Kitchen": "Kitchen",
  "Clean the Fridge": "Fridge",
  "Clean Living Room": "Living Room",
  "Clean Main Bathroom": "Main Bathroom",
  "Clean Small Bathroom": "Small Bathroom",
  "Take the Bins Out": "Bins",
};

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

  // Assign tasks normally first
  tasks.forEach((task, index) => {
    const person = flatmates[(week + index) % flatmates.length];
    assignments[task] = person;
  });

  const largeJobs = ["Kitchen", "Fridge", "Main Bathroom"];

  const bathroomACandidates = bathroomAUsers.filter(
    (person) => !largeJobs.some((job) => assignments[job] === person)
  );

  const bathroomAcleaner =
    bathroomACandidates.length > 0
      ? bathroomACandidates[week % bathroomACandidates.length]
      : bathroomAUsers[week % bathroomAUsers.length];

  assignments["Main Bathroom"] = bathroomAcleaner;
  assignments["Small Bathroom"] =
    bathroomBUsers[week % bathroomBUsers.length];

  // ---- Combine tasks by assignee into a single location string ----
  const byAssignee = {};

  Object.entries(assignments).forEach(([task, person]) => {
    const location = taskLocations[task] || task; // default to full task name
    if (!byAssignee[person]) {
      byAssignee[person] = location;
    } else {
      byAssignee[person] += " + " + location;
    }
  });

  return byAssignee;
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