export const flatmates = ["Holly", "Molly", "Finn", "Josh", "Jack"];

export const tasks = [
  "Kitchen",
  "Bins",
  "Fridge",
  "Living Room",
  "Dining Room",
];

export const bathroomAUsers = ["Holly", "Molly", "Josh"];
export const bathroomBUsers = ["Jack", "Finn"];
export const taskDetails = {
  "Kitchen":
    "\n• Sweep, mop, vacuum\n• dishes away\n• general tidy. \n• Srcub Stove Top \n• Wipe down surfaces\n• Clean sink and taps\n• Clean and Tidy Dining Room \n• Wipe down Dining Room ",
    
  "Bins": (week) => {
    const type = week % 2 === 0 ? "Food Scraps" : "Recycling"; // every other week
    return `\n• Monitor Throughout Week \n• Take out when needed \n• Bring to Road on Sunday Night (${type} Collection)`;
  },

  "Fridge":
    "\n• Wipe down all surfaces\n• remove old food\n• general tidy.",

  "Living Room":
    "\n• Sweep or vacuum \n• general tidy.",

  "Clean the Dining Room":
    "\n• Sweep or vacuum \n• general tidy.",

  "Main Bathroom":
    "\n• Mop\n• vacuum\n• general tidy\n• clean sink and shower.",

  "Small Bathroom":
    "\n• Mop\n• vacuum\n• general tidy\n• clean sink and shower.",

};