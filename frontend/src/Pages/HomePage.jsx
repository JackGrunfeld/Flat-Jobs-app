import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { taskDetails } from "../Data/cleaningData";
import { fetchHistory, saveTask } from "../services/api";
import { getAssignments, getWeekDates, getCurrentWeek } from "../utils/rosterHelpers";
import styles from "./HomePage.module.css";

const PERSON_COLORS = {
  Finn: "#FF7A00",
  Holly: "#FF8FE8",
  Jack: "#2bcf47",
  Josh: "#897ee9",
  Molly: "#CCFF66",
};

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [week, setWeek] = useState(() => getCurrentWeek());  
  const [history, setHistory] = useState({});
  const [expandedTask, setExpandedTask] = useState(null);

  useEffect(() => {
    fetchHistory().then((res) => setHistory(res.data));
  }, []);

  const assignments = getAssignments(week);

  const stats = Object.entries(assignments).reduce((acc, [person, task]) => {
    const done = history[week]?.[task]?.done;
    // Only count as "Done" if the person actually has a task assigned
    if (task && task !== "Off Duty") {
      done ? acc.done++ : acc.pending++;
    }
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
          <div className={styles.weekInfo}>
             <span className={styles.weekLabel}>
                {week === getCurrentWeek() ? "THIS WEEK" : `WEEK ${week}`}
             </span>
             <span>{getWeekDates(week)}</span>
          </div>
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

        <h2 className={styles.sectionTitle}>Chore Rotation</h2>
        
        <div className={styles.choreList}>
          {Object.entries(assignments).map(([person, task]) => {
            const isDone = history[week]?.[task]?.done;
            const isOffDuty = task === "Off Duty";

            return (
              <div 
                key={person} 
                className={styles.choreCard}
                style={{ backgroundColor: PERSON_COLORS[person] || "#2a2a2a" }}
                onClick={() => setExpandedTask(expandedTask === person ? null : person)}
              >
                {/* Aggressive Text Stack */}
                <div className={styles.choreInfo}>
                  <span className={styles.choreName}>{person}</span>
                  <span className={styles.choreTask}>{task}</span>
                </div>
                
                {/* Checkbox - Hidden if Off Duty */}
                {!isOffDuty && (
                  <div 
                    className={`${styles.checkbox} ${isDone ? styles.checked : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(task, person, !isDone);
                    }}
                  />
                )}

                {expandedTask === person && !isOffDuty && (
                  <div className={styles.details}>
                    <p>{taskDetails[task] || "Standard clean. Check logbook for details."}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Navigation Tab Bar */}
      <nav className={styles.tabBar}>
        {[
          { name: 'Home', path: '/' },
          { name: 'House', path: '/house' },
          { name: 'Settings', path: '/settings' }
        ].map(tab => (
          <button 
            key={tab.name} 
            className={`${styles.tab} ${location.pathname === tab.path ? styles.activeTab : ''}`}
            onClick={() => navigate(tab.path)}
          >
            <div className={styles.tabIcon} />
            <span>{tab.name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}