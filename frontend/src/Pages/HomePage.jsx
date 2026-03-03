import React, { useState, useEffect } from "react";
import  { ReactComponent as Logo } from "../Componets/logos/TICK-IT.svg";
import {
  flatmates,
  tasks,
  bathroomAUsers,
  bathroomBUsers,
  taskDetails,
} from "../Data/cleaningData";
import { fetchHistory, saveTask } from "../services/api";
import { getAssignments, getWeekDates, getCurrentWeek } from "../utils/rosterHelpers";
import styles from "./HomePage.module.css";
import "../Componets/TaskCard/TaskBox.css";
import "../Componets/TaskCard/TaskTitle.css";
import "../Componets/TaskCard/TaskAssignee.css";
import "../Componets/TaskCard/TaskDetails.css";
import "../Componets/TaskCard/TaskLabel.css";
import "../Componets/WeekTitle/WeekTitle.css";




export default function HomePage() {
  const [week, setWeek] = useState(0);
  const [history, setHistory] = useState({});
  const [expandedTask, setExpandedTask] = useState(null);

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
    const person = assignments[task];

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

  return (
    <div className={styles.container}>

      <div className="title-image">
        <Logo className="Logo" />
      </div>

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
          onChange={(e) => {
            const checked = e.target.checked;
            toggleTask(tasksString, checked);
          }}
        />
      </label>

      {/* DETAILS SECTION */}
      {expandedTask === person && (
        <div className="task-details-container">
          {tasksString
            .split(" + ")
            .map((t, i) => (
              <div key={i} className="task-details">
                <strong>{t}</strong> {/* optional: show the task/location name */}
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
      {/* NEXT WEEK BUTTON */}
      <button
        onClick={() => setWeek((w) => w + 1)}
        style={{
          marginTop: "2rem",
          padding: "0.8rem 1.5rem",
          background: "#7c3aed",
          color: "white",
          borderRadius: "0.8rem",
          border: "none",
          fontSize: "1rem",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        Next Week ➜
      </button>

      {/* --- CLEANING HISTORY --- */}
      <div
        style={{
          marginTop: "2.5rem",
          width: "100%",
          maxWidth: "900px",
          background: "white",
          padding: "1.5rem",
          borderRadius: "1rem",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1rem" }}>
          📚 Cleaning History
        </h2>

        {Object.keys(history).length === 0 && <p>No history yet.</p>}

        {Object.keys(history).map((weekNum) => (
          <div key={weekNum} style={{ marginBottom: "1rem" }}>
            <h3 style={{ fontWeight: "600" }}>
              Week {Number(weekNum) + 1} — {getWeekDates(Number(weekNum))}
            </h3>

            <ul style={{ paddingLeft: "1.5rem", marginTop: "0.5rem" }}>
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