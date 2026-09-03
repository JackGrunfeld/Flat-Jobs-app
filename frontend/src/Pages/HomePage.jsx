import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { fetchHistory, saveTask, fetchChores } from "../services/api";
import { getWeekDates, getCurrentWeek, getPeriodIndex } from "../utils/rosterHelpers";
import { useAuth } from "../contexts/AuthContext";
import styles from "./HomePage.module.css";

const PALETTE = ["#FF7A00", "#FF8FE8", "#2bcf47", "#897ee9", "#CCFF66", "#4DA6FF", "#C084FC"];

function fireCompletionAlert(displayName, taskLabel, frequency) {
  try {
    if (!("Notification" in window)) { console.log("[Home] fireCompletionAlert — Notification API not supported"); return; }
    if (Notification.permission !== "granted") { console.log("[Home] fireCompletionAlert — permission not granted:", Notification.permission); return; }
    // Block only when the user has explicitly disabled the toggle ("false").
    // null means permission was granted before the toggle was ever used — still fire.
    if (localStorage.getItem("completionAlerts") === "false") { console.log("[Home] fireCompletionAlert — blocked by user toggle"); return; }
    console.log("[Home] fireCompletionAlert — firing notification");
    new Notification("Tick-IT", {
      body: `${displayName} completed their ${(frequency || "weekly").toLowerCase()} chore: ${taskLabel}`,
      icon: "/Logo.png",
    });
  } catch {}
}

// Returns { [personName]: string[] } — array of chore names assigned this period (empty = off duty).
// "All-member" chores and "specific-member" chores rotate in independent groups so that
// specific-member chores don't displace people from the all-member rotation.
function buildAssignments(chores, members, week) {
  const tasksByMember = {};
  members.forEach(m => { tasksByMember[m.name] = []; });

  const allChores = chores.filter(c => !c.memberIds?.length);
  const specificChores = chores.filter(c => c.memberIds?.length > 0);

  allChores.forEach((chore, index) => {
    if (members.length === 0) return;
    const periodIndex = getPeriodIndex(chore.frequency, week);
    console.log(`[Home] allChore "${chore.name}" freq=${chore.frequency} week=${week} periodIndex=${periodIndex} pool=${members.length} → slot=${(periodIndex + index) % members.length}`);
    const assigned = members[(periodIndex + index) % members.length];
    if (assigned) tasksByMember[assigned.name].push(chore.name);
  });

  specificChores.forEach((chore, index) => {
    const pool = members.filter(m => chore.memberIds.includes(m.uid));
    if (pool.length === 0) return;
    const periodIndex = getPeriodIndex(chore.frequency, week);
    console.log(`[Home] specificChore "${chore.name}" freq=${chore.frequency} week=${week} periodIndex=${periodIndex} pool=${pool.length} → slot=${(periodIndex + index) % pool.length}`);
    const assigned = pool[(periodIndex + index) % pool.length];
    if (assigned) tasksByMember[assigned.name].push(chore.name);
  });

  return tasksByMember;
}

// Returns { [fullName]: displayName }.
// Shows first name only; appends "F L." when two members share the same first name.
function buildDisplayNames(members) {
  const firstNames = members.map(m => (m.name || "").trim().split(/\s+/)[0] || m.name);
  const displayNames = {};
  members.forEach((m) => {
    const parts = (m.name || "").trim().split(/\s+/);
    const first = parts[0] || m.name;
    const isDuplicate = firstNames.filter(n => n === first).length > 1;
    displayNames[m.name] = (isDuplicate && parts.length > 1)
      ? `${first} ${parts[1][0].toUpperCase()}.`
      : first;
  });
  return displayNames;
}

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userFlat } = useAuth();

  const [week, setWeek] = useState(() => getCurrentWeek());
  const [history, setHistory] = useState({});
  const [expandedTask, setExpandedTask] = useState(null);
  const [chores, setChores] = useState([]);

  useEffect(() => {
    if (!userFlat?.id) return;
    console.log("[Home] fetching history and chores for flat:", userFlat.id);
    fetchHistory(userFlat.id).then(res => {
      console.log("[Home] history loaded — weeks:", Object.keys(res.data).length);
      setHistory(res.data);
    });
    fetchChores(userFlat.id).then(chores => {
      console.log("[Home] chores loaded:", chores.length);
      setChores(chores);
    });
  }, [userFlat?.id]);

  const members = (userFlat?.memberIds || []).map((uid, i) => ({
    uid,
    name: userFlat.memberNames?.[uid] || uid,
    color: userFlat.memberColors?.[uid] || PALETTE[i % PALETTE.length],
  }));

  const personColors = Object.fromEntries(members.map(m => [m.name, m.color]));
  const displayNames = buildDisplayNames(members);
  const choreDescriptions = Object.fromEntries(chores.map(c => [c.name, c.description]));
  const choreFrequencies = Object.fromEntries(chores.map(c => [c.name, c.frequency || "Weekly"]));
  const assignments = buildAssignments(chores, members, week);
  console.log("[Home] week:", week, "members:", members.length, "chores:", chores.length);

  // Stats count only non-monthly tasks (monthly tasks are tracked separately in the dropdown)
  const stats = Object.entries(assignments).reduce((acc, [, tasks]) => {
    const main = tasks.filter(t => (choreFrequencies[t] || "Weekly").toLowerCase() !== "monthly");
    if (main.length === 0) return acc;
    main.every(t => history[week]?.[t]?.done) ? acc.done++ : acc.pending++;
    return acc;
  }, { done: 0, pending: 0 });

  const handleToggle = (task, person, checked) => {
    console.log("[Home] handleToggle — checked:", checked);
    saveTask({ flatId: userFlat.id, week, task, person, done: checked }).then(() => {
      setHistory(prev => ({
        ...prev,
        [week]: { ...(prev[week] || {}), [task]: { done: checked, person } },
      }));
      if (checked) {
        console.log("[Home] firing completion alert");
        fireCompletionAlert(
          displayNames[person] || person,
          task,
          choreFrequencies[task]
        );
      }
    });
  };

  const handleToggleAll = (tasks, person, checked) => {
    console.log("[Home] handleToggleAll — tasks:", tasks.length, "checked:", checked);
    Promise.all(
      tasks.map(t => saveTask({ flatId: userFlat.id, week, task: t, person, done: checked }))
    ).then(() => {
      setHistory(prev => {
        const weekHistory = { ...(prev[week] || {}) };
        tasks.forEach(t => { weekHistory[t] = { done: checked, person }; });
        return { ...prev, [week]: weekHistory };
      });
      if (checked) {
        const label = tasks.length === 1 ? tasks[0] : tasks.join(", ");
        const freq = tasks.length === 1 ? choreFrequencies[tasks[0]] : "weekly";
        console.log("[Home] firing completion alert");
        fireCompletionAlert(displayNames[person] || person, label, freq);
      }
    });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.logo}>hommies</h1>
        <div className={styles.weekNav}>
          <button onClick={() => setWeek(w => Math.max(0, w - 1))}>←</button>
          <div className={styles.weekInfo}>
            <span className={styles.weekLabel}>
              {week === getCurrentWeek() ? "THIS WEEK " : `WEEK `}
            </span>
            <span>{getWeekDates(week)}</span>
          </div>
          <button onClick={() => setWeek(w => w + 1)}>→</button>
        </div>
      </header>

      <main className={styles.content}>
        {chores.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No chores configured</p>
            <p className={styles.emptyHint}>Go to House → Chore List to add your first chore.</p>
          </div>
        ) : (
          <>
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
              {Object.entries(assignments).map(([person, tasks]) => {
                const mainTasks = tasks.filter(t => (choreFrequencies[t] || "Weekly").toLowerCase() !== "monthly");
                const monthlyTasks = tasks.filter(t => (choreFrequencies[t] || "Weekly").toLowerCase() === "monthly");

                const isOffDuty = tasks.length === 0;
                const noWeeklyTasks = mainTasks.length === 0;
                const allDone = !noWeeklyTasks && mainTasks.every(t => history[week]?.[t]?.done);
                const isExpanded = expandedTask === person;
                const canExpand = !isOffDuty;
                const taskLabel = noWeeklyTasks ? "Off Duty" : mainTasks.join(" + ");

                return (
                  <div
                    key={person}
                    className={styles.choreCard}
                    style={{ backgroundColor: personColors[person] || "#2a2a2a" }}
                    onClick={() => canExpand && setExpandedTask(isExpanded ? null : person)}
                  >
                    <div className={styles.choreInfo}>
                      <span className={styles.choreName}>{displayNames[person] || person}</span>
                      <span className={styles.choreTask}>
                        {taskLabel}
                        {monthlyTasks.length > 0 && (
                          <span className={styles.monthlyCardBadge}>M</span>
                        )}
                      </span>
                    </div>

                    {/* Main checkbox: only for weekly/daily tasks */}
                    {!noWeeklyTasks && (
                      <div
                        className={`${styles.checkbox} ${allDone ? styles.checked : ""}`}
                        onClick={e => {
                          e.stopPropagation();
                          handleToggleAll(mainTasks, person, !allDone);
                        }}
                      />
                    )}

                    {isExpanded && (
                      <div
                        className={styles.details}
                        onClick={e => e.stopPropagation()}
                      >
                        {/* Weekly/daily tasks */}
                        {mainTasks.length === 1 && monthlyTasks.length === 0 && (
                          <p>{choreDescriptions[mainTasks[0]] || "No description added."}</p>
                        )}
                        {mainTasks.length > 1 && mainTasks.map(t => (
                          <div key={t} className={styles.subTaskRow}>
                            <div className={styles.subTaskInfo}>
                              <span className={styles.subTaskName}>{t}</span>
                              {choreDescriptions[t] && (
                                <p className={styles.subTaskDesc}>{choreDescriptions[t]}</p>
                              )}
                            </div>
                            <div
                              className={`${styles.checkbox} ${history[week]?.[t]?.done ? styles.checked : ""}`}
                              onClick={e => {
                                e.stopPropagation();
                                handleToggle(t, person, !history[week]?.[t]?.done);
                              }}
                            />
                          </div>
                        ))}

                        {/* Monthly tasks — shown with a badge, separate from weekly rotation */}
                        {monthlyTasks.length > 0 && (
                          <div className={mainTasks.length > 0 ? styles.monthlySeparator : undefined}>
                            {monthlyTasks.map(t => (
                              <div key={t} className={styles.subTaskRow}>
                                <div className={styles.subTaskInfo}>
                                  <span className={styles.monthlyBadge}>Monthly</span>
                                  <span className={styles.subTaskName}>{t}</span>
                                  {choreDescriptions[t] && (
                                    <p className={styles.subTaskDesc}>{choreDescriptions[t]}</p>
                                  )}
                                </div>
                                <div
                                  className={`${styles.checkbox} ${history[week]?.[t]?.done ? styles.checked : ""}`}
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleToggle(t, person, !history[week]?.[t]?.done);
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      <nav className={styles.tabBar}>
        {[
          { name: 'Home', path: '/' },
          { name: 'House', path: '/house' },
          { name: 'Shopping', path: '/shopping' },
          { name: 'Settings', path: '/settings' },
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
