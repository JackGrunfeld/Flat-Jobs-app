export const flatmates = ["Holly", "Molly", "Finn", "Josh", "Jack"];

export const tasks = [
  "Clean the Kitchen",
  "Take the Bins Out",
  "Clean the Fridge",
  "Clean the Living Room",
  "Clean the Dining Room",
];

export const bathroomAUsers = ["Holly", "Molly", "Josh"];
export const bathroomBUsers = ["Jack", "Finn"];

export const taskDetails = {
  "Clean the Kitchen":
    "Sweep, mop, vacuum, dishes away, general tidy.",
  "Take the Bins Out": (week) => {
    const type = week % 2 === 0 ? "Food Scraps" : "Recycling";
    return `Monitor bin during the week, take out when needed, and put on the road for ${type} collection on Sunday night.`;
  },
  "Clean the Fridge":
    "Wipe down all surfaces, remove old food, general tidy.",
  "Clean the Living Room":
    "Sweep or vacuum, general tidy.",
  "Clean the Dining Room":
    "Sweep or vacuum, general tidy.",
  "Clean Bathroom A (Holly, Molly, Josh)":
    "Mop, vacuum, general tidy, clean sink and shower.",
  "Clean Bathroom B (Jack, Finn)":
    "Mop, vacuum, general tidy, clean sink and shower.",
};