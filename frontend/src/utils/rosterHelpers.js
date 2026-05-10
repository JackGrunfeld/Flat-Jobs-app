// utils/rosterHelper.js
import { flatmates, tasks, bathroomAUsers, bathroomBUsers } from "../Data/cleaningData";

export const baseDate = new Date(2026, 4, 11);

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
  const byAssignee = {};

  // 1. INITIALIZE: Ensure every flatmate has an entry so they always show up
  flatmates.forEach((person) => {
    byAssignee[person] = "";
  });

  // 2. Original Task Assignment
  tasks.forEach((task, index) => {
    const person = flatmates[(week + index) % flatmates.length];
    assignments[task] = person;
  });

  const largeJobs = ["Kitchen", "Fridge + Pantry", "Main Bathroom"];

  // 3. Assign Main Bathroom
  const bathroomACandidates = bathroomAUsers.filter(
    (person) => !largeJobs.some((job) => assignments[job] === person)
  );

  const bathroomAcleaner =
    bathroomACandidates.length > 0
      ? bathroomACandidates[week % bathroomACandidates.length]
      : bathroomAUsers[week % bathroomAUsers.length];

  assignments["Main Bathroom"] = bathroomAcleaner;

  // 4. Assign Small Bathroom
  const smallBathroomPerson = bathroomBUsers[week % bathroomBUsers.length];
  assignments["Small Bathroom"] = smallBathroomPerson;

  // 5. COMBINE: Populate the strings for each person
  Object.entries(assignments).forEach(([task, person]) => {
    const location = taskLocations[task] || task;
    if (byAssignee[person] === "") {
      byAssignee[person] = location;
    } else {
      byAssignee[person] += " + " + location;
    }
  });

  // 6. CLEANUP: If someone has no chores, give them a placeholder
  flatmates.forEach((person) => {
    if (!byAssignee[person] || byAssignee[person] === "") {
      byAssignee[person] = "Off Duty";
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