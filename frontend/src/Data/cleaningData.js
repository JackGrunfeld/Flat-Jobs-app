export const flatmates = ["Holly", "Molly", "Finn", "Josh", "Jack"];

export const tasks = [
  "Kitchen",
  "Bins",
  "Fridge + Pantry",
  "Living Room",
  "Dining Room",
];

export const bathroomAUsers = ["Holly", "Molly", "Josh"];
export const bathroomBUsers = ["Jack", "Finn"];

/**
 * TASK DETAILS
 */
export const taskDetails = {
  Kitchen:
    "\n• Sweep, mop, vacuum\n• Dishes away\n• General tidy\n• Scrub stove top\n• Wipe down surfaces\n• Clean sink and taps\n• Clean and tidy dining room\n• Wipe down dining table",

  Bins: (week) => {
    const type = week % 2 === 0 ? "Food Scraps" : "Recycling";

    return `\n• Monitor throughout week\n• Take out when needed\n• Bring to road on Sunday night (${type} Collection)`;
  },

  "Fridge + Pantry":
    "\n• Wipe down all surfaces\n• Remove old food\n• General tidy",

  "Living Room":
    "\n• Sweep or vacuum\n• General tidy",

  "Dining Room":
    "\n• Sweep or vacuum\n• General tidy",

  "Main Bathroom":
    "\n• Mop\n• Vacuum\n• General tidy\n• Clean sink and shower",

  "Small Bathroom":
    "\n• Mop\n• Vacuum\n• General tidy\n• Clean sink and shower",
};

/**
 * GET WEEK NUMBER
 */
export function getWeekNumber(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 1);

  const diff =
    date -
    start +
    (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60000;

  const oneWeek = 1000 * 60 * 60 * 24 * 7;

  return Math.floor(diff / oneWeek);
}

/**
 * GENERATE WEEKLY ASSIGNMENTS
 */
export function generateAssignments(date = new Date()) {
  const week = getWeekNumber(date);

  const assignments = {};

  // Initialize assignments for all flatmates to avoid undefined entries
  flatmates.forEach((person) => {
    assignments[person] = [];
  });

  /**
   * ROTATE MAIN TASKS
   */
  tasks.forEach((task, index) => {
    const person = flatmates[(index + week) % flatmates.length];
    assignments[person].push(task);
  });

  /**
   * ROTATE MAIN BATHROOM
   */
  const mainBathroomPerson = bathroomAUsers[week % bathroomAUsers.length];
  if (mainBathroomPerson && assignments[mainBathroomPerson]) {
    assignments[mainBathroomPerson].push("Main Bathroom");
  }

  /**
   * ROTATE SMALL BATHROOM
   */
  const smallBathroomPerson = bathroomBUsers[week % bathroomBUsers.length];
  if (smallBathroomPerson && assignments[smallBathroomPerson]) {
    assignments[smallBathroomPerson].push("Small Bathroom");
  }

  // Ensure no undefined or duplicate entries
  flatmates.forEach((person) => {
    if (!assignments[person] || assignments[person].length === 0) {
      assignments[person] = ["Off Duty"];
    }
  });

  return assignments;
}

/**
 * FORMAT ASSIGNMENTS FOR UI
 */
export function getFormattedAssignments(date = new Date()) {
  const assignments = generateAssignments(date);

  return Object.entries(assignments).map(([name, chores]) => ({
    name,
    chores: chores.join(" + "),
  }));
}