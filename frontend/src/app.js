import React, { useState, useEffect } from "react";
import axios from "axios";

const flatmates = ["Holly", "Molly", "Finn", "Josh", "Jack"];
const tasks = [
  "Clean the Kitchen",
  "Take the Bins Out",
  "Clean the Fridge",
  "Clean the Living Room",
  "Clean the Dining Room",
];

const bathroomAUsers = ["Holly", "Molly", "Josh"];
const bathroomBUsers = ["Jack", "Finn"];

const taskDetails = {
  "Clean the Kitchen": "Sweep, mop, vacuum, dishes away, general tidy.",
  "Take the Bins Out": (week) => {
    const type = week % 2 === 0 ? "Food Scraps" : "Recycling";
    return `Monitor bin during the week, take out when needed, and put on the road for ${type} collection on Sunday night.`;
  },
  "Clean the Fridge": "Wipe down all surfaces, remove old food, general tidy.",
  "Clean the Living Room": "Sweep or vacuum, general tidy.",
  "Clean the Dining Room": "Sweep or vacuum, general tidy.",
  "Clean Bathroom A (Holly, Molly, Josh)": "Mop, vacuum, general tidy, clean sink and shower.",
  "Clean Bathroom B (Jack, Finn)": "Mop, vacuum, general tidy, clean sink and shower.",
};

const baseDate = new Date(); // first Monday of rotation

// ✅ Use relative URL so it works on both localhost and Render
const API_BASE = process.env.REACT_APP_API_URL || "https://flat-jobs-app.onrender.com";

export default function CleaningRosterApp() {
  const [week, setWeek] = useState(0);
  const [history, setHistory] = useState({});
  const [expandedTask, setExpandedTask] = useState(null);

  // Load history from backend
  useEffect(() => {
    axios.get(`${API_BASE}/history`).then((res) => {
      setHistory(res.data);
    });
  }, []);

  // Auto-calculate current week based on Monday-Sunday weeks
  useEffect(() => {
    const today = new Date();
    const day = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() + (day === 0 ? -6 : 1 - day));
    const diffDays = Math.floor((monday - baseDate) / (1000 * 60 * 60 * 24));
    setWeek(Math.floor(diffDays / 7));
  }, []);

  const getAssignments = () => {
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
  };

  const getWeekDates = (weekIndex) => {
    const start = new Date(baseDate);
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday + weekIndex * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const options = {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    };
    return `${start.toLocaleDateString("en-US", options)} to ${end.toLocaleDateString("en-US", options)}`;
  };

  const assignments = getAssignments();

  const toggleTask = (task, checked) => {
    const person = assignments[task];
    axios
      .post(`${API_BASE}/history`, { week, task, person, done: checked })
      .then(() => {
        setHistory((prev) => ({
          ...prev,
          [week]: {
            ...prev[week],
            [task]: { done: checked, person },
          },
        }));
      });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-300 to-blue-200 p-8 flex flex-col items-center text-gray-800">
      <h1 className="text-4xl font-extrabold mb-6 drop-shadow">
        🏡 Flat Cleaning Roster
      </h1>
      <p className="text-lg mb-4">
        Week: {week + 1} ({getWeekDates(week)})
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl">
        {Object.keys(assignments).map((task) => (
          <div
            key={task}
            className="bg-white rounded-2xl p-4 shadow hover:scale-105 transition-transform duration-200 border border-purple-200 cursor-pointer"
            onClick={() =>
              setExpandedTask(expandedTask === task ? null : task)
            }
          >
            <h2 className="font-bold text-xl mb-2">{task}</h2>
            <p className="text-lg">🧹 {assignments[task]}</p>

            {expandedTask === task && (
              <div className="mt-2 p-2 bg-purple-50 rounded-lg text-sm">
                {typeof taskDetails[task] === "function"
                  ? taskDetails[task](week)
                  : taskDetails[task]}
              </div>
            )}

            <label className="flex items-center gap-2 mt-3">
              <input
                type="checkbox"
                checked={history[week]?.[task]?.done || false}
                onChange={(e) => toggleTask(task, e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                className="w-5 h-5"
              />
              <span>Task Completed</span>
            </label>
          </div>
        ))}
      </div>

      <button
        onClick={() => setWeek((w) => w + 1)}
        className="mt-8 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-md text-lg transition"
      >
        Next Week ➜
      </button>

      <div className="mt-10 w-full max-w-3xl bg-white p-6 rounded-2xl shadow">
        <h2 className="text-2xl font-bold mb-4">📚 Cleaning History</h2>
        {Object.keys(history).length === 0 && <p>No history yet.</p>}

        {Object.keys(history).map((weekNum) => (
          <div key={weekNum} className="mb-4 border-b pb-2">
            <h3 className="font-semibold text-lg">
              Week {Number(weekNum) + 1} ({getWeekDates(Number(weekNum))})
            </h3>
            <ul className="list-disc ml-6">
              {Object.keys(history[weekNum]).map((task) => (
                <li key={task}>
                  {task}:{" "}
                  {history[weekNum][task].done
                    ? `✅ Done by ${history[weekNum][task].person}`
                    : "❌ Not Done"}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}