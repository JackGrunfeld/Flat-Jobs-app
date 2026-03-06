import React, { useState, useEffect } from "react";

import  { ReactComponent as Logo } from "../Componets/logos/TICK-IT.svg";
import {
  taskDetails,
} from "../Data/cleaningData";
import { fetchHistory, saveTask } from "../services/api";
import { getAssignments, getWeekDates } from "../utils/rosterHelpers";
import styles from "./HomePage.module.css";
import "../Componets/TaskCard/TaskBox.css";
import "../Componets/TaskCard/TaskTitle.css";
import "../Componets/TaskCard/TaskAssignee.css";
import "../Componets/TaskCard/TaskDetails.css";
import "../Componets/TaskCard/TaskLabel.css";
import "../Componets/WeekTitle/WeekTitle.css";
import "../Componets/NavBar/NavBar.css";
import "../Componets/TaskHistory/TaskHistory.css";


export default function HomePage() {
  const [week, setWeek] = useState(0);
  const [history, setHistory] = useState({});
  const [expandedTask, setExpandedTask] = useState(null);
  const [view, setView] = useState("home");
  const [activeNav, setActiveNav] = useState("Home"); // NEW: active nav button


  useEffect(() => {
    fetchHistory().then((res) => {
      setHistory(res.data);
    });
  }, []);

  const assignments = getAssignments(week);

  // map each flatmate to a distinct colour for visual identification
  const personColors = {
    Holly: '#fd9ff5',
    Molly: '#a6f948',
    Finn: '#fe7200',
    Josh: '#008cff',
    Jack: '#00d01c',
  };
  const getPersonColor = (person) => personColors[person] || 'transparent';

  // Save task toggle
  const toggleTask = (task, checked) => {
    const person = Object.keys(assignments).find(
      (p) => assignments[p] === task
    );

    saveTask({
      week,
      task,
      person,
      done: checked,
    }).then(() => {
      setHistory((prev) => ({
        ...prev,
        [week]: {
          ...prev[week],
          [task]: { done: checked, person },
        },
      }));
    });
  };

  const handleNavClick = (name) => {
    console.log(`${name} button clicked`);
    setActiveNav(name); // set the clicked button as active
    setView(name.toLowerCase()); // optional: update view if needed
  };

  return (
    <div className={styles.container}>

        <div className="title-image">
          <Logo className="Logo" />
        </div>

         {/* NAVIGATION BAR */}
      <nav className="navbar">
        {["Home", "History", "Settings"].map((item) => (
          <button
            key={item}
            className={`nav-item ${activeNav === item ? "active" : ""}`}
            onClick={() => handleNavClick(item)}
          >
            {item}
          </button>
        ))}
      </nav>



      {/* WEEK HEADER */}
     <div className="week-header">
      <button className="week-btn" onClick={() => setWeek(w => Math.max(0, w - 1))}>
      &lt;
  </button>

  <div className="week-info">
    <div className="week-title"> THIS WEEK</div>
    <div className="week-range">{getWeekDates(week)}</div>
  </div>

  <button className="week-btn" onClick={() => setWeek(w => w + 1)}>
    &gt;
  </button>
</div>



{/* --- TASK CARDS --- */}


{/* CONDITIONAL VIEW RENDERING */}
{view === "home" && (
  <div className={styles.cardGrid}>
    {Object.entries(assignments).map(([person, tasksString]) => (
      <div
        key={person}
        className="task-box"
        style={{ backgroundColor: getPersonColor(person) }}
        onClick={() =>
          setExpandedTask(expandedTask === person ? null : person)
        }
      >
        {/* LEFT SIDE */}
        <div className="task-left">
          <h2 className="task-assignee">{person}</h2>
          <p className="task-title">{tasksString}</p>
        </div>

        {/* RIGHT SIDE CHECKBOX */}
        <label className="task-label" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="task-checkbox"
            checked={history[week]?.[tasksString]?.done || false}
            onChange={(e) => toggleTask(tasksString, e.target.checked)}
          />
        </label>

        {/* DETAILS SECTION */}
        {expandedTask === person && (
          <div className="task-details-container">
            {tasksString.split(" + ").map((t, i) => (
              <div key={i} className="task-details">
                <strong>{t}</strong>
                <div className="task-details-text">
                  {typeof taskDetails[t] === "function"
                    ? taskDetails[t](week)
                    : taskDetails[t]}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ))}
  </div>
)}

      {view === "history" && history[week] && (
      <div className={styles.cardGrid}>
        {Object.keys(history[week]).map((task) => {
          const done = history[week][task].done;
          const person = history[week][task].person;

          return (
                  <div
          key={task}
          className="history-card"
          style={{ backgroundColor: getPersonColor(person) }}
        >
          <h2>{task}</h2>
          <div className={`status ${done ? "done" : "not-done"}`}>
            {done ? "Done by " + person : "Not Done"}
          </div>
        </div>
      );
    })}
  </div>
)}
    </div>
  );
}

