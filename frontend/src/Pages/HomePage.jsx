import React, { useState, useEffect } from "react";
import { taskDetails } from "../Data/cleaningData";
import { fetchHistory, saveTask } from "../services/api";
import { getAssignments, getWeekDates, getCurrentWeek } from "../utils/rosterHelpers";
import styles from "./HomePage.module.css";

// Person-specific colors from mockup
const PERSON_COLORS = {
  Finn: "#FF7A00",
  Holly: "#FF8FE8",
  Jack: "#2bcf47",
  Josh: "#897ee9",
  Molly: "#CCFF66",
};

export default function HomePage() {
  const [week, setWeek] = useState(() => getCurrentWeek());  
  const [history, setHistory] = useState({});
  const [expandedTask, setExpandedTask] = useState(null);
  const [view, setView] = useState("home");

  useEffect(() => {
    fetchHistory().then((res) => setHistory(res.data));
  }, []);

  const assignments = getAssignments(week);

  // Derive stats for the dashboard cards
  const stats = Object.entries(assignments).reduce((acc, [person, task]) => {
    const done = history[week]?.[task]?.done;
    done ? acc.done++ : acc.pending++;
    return acc;
  }, { done: 0, pending: 0 });

  const handleToggle = (task, person, checked) => {
    saveTask({ week, task, person, done: checked }).then(() => {
      setHistory(prev => ({
        ...prev,
        [week]: { ...prev[week], [task]: { done: checked, person } }
      }));
    });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.logo}>TICK-IT</h1>
        <div className={styles.weekNav}>
          <button onClick={() => setWeek(w => Math.max(0, w - 1))}>←</button>
          <span>{getWeekDates(week)}</span>
          <button onClick={() => setWeek(w => w + 1)}>→</button>
        </div>
      </header>

      <main className={styles.content}>
        <div className={styles.statRow}>
          <div className={styles.statCard}>
            <span className={styles.statNum}>{stats.done}</span>
            <span className={styles.statLabel}>Done</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statNum}>{stats.pending}</span>
            <span className={styles.statLabel}>Pending</span>
          </div>
        </div>

        <h2 className={styles.sectionTitle}>This Week</h2>
        
        <div className={styles.choreList}>
          {Object.entries(assignments).map(([person, task]) => {
            const isDone = history[week]?.[task]?.done;
            return (
              <div 
                key={person} 
                className={styles.choreCard}
                style={{ backgroundColor: PERSON_COLORS[person] }}
                onClick={() => setExpandedTask(expandedTask === person ? null : person)}
              >
                <div className={styles.choreInfo}>
                  <span className={styles.choreName}>{person}</span>
                  <span className={styles.choreTask}>{task}</span>
                </div>
                <div 
                  className={`${styles.checkbox} ${isDone ? styles.checked : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle(task, person, !isDone);
                  }}
                />
                {expandedTask === person && (
                  <div className={styles.details}>
                    <p>{taskDetails[task] || "No extra instructions."}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      <nav className={styles.tabBar}>
        {['Home', 'Config', 'Settings'].map(tab => (
          <button 
            key={tab} 
            className={`${styles.tab} ${view === tab.toLowerCase() ? styles.activeTab : ''}`}
            onClick={() => setView(tab.toLowerCase())}
          >
            <div className={styles.tabIcon} />
            <span>{tab}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}