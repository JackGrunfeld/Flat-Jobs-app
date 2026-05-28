import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { updateMemberColor } from "../services/flatService";
import styles from "./SettingsPage.module.css";

const PALETTE = ["#FF7A00", "#FF8FE8", "#2bcf47", "#897ee9", "#CCFF66", "#4DA6FF", "#C084FC", "#FF4B00", "#f43f5e", "#06b6d4"];

function getPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

function lsGet() {
  try { return localStorage.getItem("completionAlerts"); } catch { return null; }
}
function lsSet(val) {
  try { localStorage.setItem("completionAlerts", val); } catch {}
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, userFlat, logout, refreshFlat, leaveFlat } = useAuth();
  const [savingColor, setSavingColor] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const [permission, setPermission] = useState(getPermission);
  // Toggle is ON when permission is granted AND user hasn't explicitly turned it off
  const [completionAlerts, setCompletionAlerts] = useState(() => {
    if (getPermission() !== "granted") return false;
    return lsGet() !== "false"; // default to ON when permission is already granted
  });

  // If the browser/OS permission was manually set to granted before the user ever
  // touched the toggle, auto-write localStorage so fireCompletionAlert can fire.
  useEffect(() => {
    const perm = getPermission();
    const ls = lsGet();
    console.log("[Settings] mount — permission:", perm, "localStorage completionAlerts:", ls);
    if (perm === "granted" && ls === null) {
      console.log("[Settings] auto-setting localStorage completionAlerts=true (pre-granted)");
      lsSet("true");
    }
  }, []);

  const myUid = currentUser?.uid;
  const myColorIndex = (userFlat?.memberIds || []).indexOf(myUid);
  const myColor = userFlat?.memberColors?.[myUid] || PALETTE[Math.max(myColorIndex, 0) % PALETTE.length];

  const handleColorChange = async (color) => {
    if (color === myColor || savingColor || !userFlat?.id) return;
    setSavingColor(true);
    await updateMemberColor(userFlat.id, myUid, color);
    await refreshFlat(myUid);
    setSavingColor(false);
  };

  // NOT async — requestPermission() must be called synchronously inside a user-gesture
  // handler so the browser recognizes it as user-initiated.
  const handleToggleAlerts = () => {
    console.log("[Settings] handleToggleAlerts — permission:", permission, "completionAlerts:", completionAlerts);
    if (permission === "unsupported") { console.log("[Settings] toggle blocked — unsupported"); return; }

    // ── Turn OFF ──
    if (completionAlerts) {
      console.log("[Settings] turning OFF alerts");
      lsSet("false");
      setCompletionAlerts(false);
      return;
    }

    // ── Turn ON when already denied ──
    if (permission === "denied") {
      console.log("[Settings] cannot enable — permission denied by browser");
      setPermission("denied");
      return;
    }

    // ── Turn ON when already granted ──
    if (permission === "granted") {
      console.log("[Settings] permission already granted — enabling alerts");
      lsSet("true");
      setCompletionAlerts(true);
      try {
        new Notification("Tick-IT", {
          body: "Completion alerts on — you'll be notified when a flatmate finishes a chore.",
          icon: "/Logo.png",
        });
      } catch {}
      return;
    }

    // ── Permission is "default" — request it NOW (synchronous call, .then for result) ──
    console.log("[Settings] requesting notification permission…");
    Notification.requestPermission().then(result => {
      console.log("[Settings] requestPermission result:", result);
      setPermission(result);
      if (result === "granted") {
        lsSet("true");
        setCompletionAlerts(true);
        try {
          new Notification("Tick-IT", {
            body: "Completion alerts on — you'll be notified when a flatmate finishes a chore.",
            icon: "/Logo.png",
          });
        } catch {}
      } else {
        console.log("[Settings] permission not granted:", result);
        lsSet("false");
        setCompletionAlerts(false);
      }
    });
  };

  const denied  = permission === "denied";
  const unsupported = permission === "unsupported";

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.logo}>TICK-IT</h1>
        <h2 className={styles.pageTitle}>Settings</h2>
      </header>

      <main className={styles.content}>
        <section className={styles.section}>
          <label className={styles.sectionLabel}>Account</label>
          <div className={styles.settingRow}>
            <span>Signed in as</span>
            <span className={styles.val}>{currentUser?.displayName || currentUser?.email}</span>
          </div>
          <div className={styles.settingRow}>
            <span>Flat</span>
            <span className={styles.val}>{userFlat?.name || "—"}</span>
          </div>
        </section>

        <section className={styles.section}>
          <label className={styles.sectionLabel}>Profile Colour</label>
          <div className={styles.colorPicker}>
            {PALETTE.map(c => (
              <button
                key={c}
                className={`${styles.colorSwatch} ${myColor === c ? styles.colorSwatchActive : ""}`}
                style={{ backgroundColor: c }}
                onClick={() => handleColorChange(c)}
                disabled={savingColor}
                aria-label={c}
              />
            ))}
          </div>
          <div className={styles.colorPreview}>
            <div className={styles.colorDot} style={{ backgroundColor: myColor }} />
            <span className={styles.colorPreviewName}>{currentUser?.displayName}</span>
          </div>
        </section>

        <section className={styles.section}>
          <label className={styles.sectionLabel}>Notifications</label>
          <div className={styles.settingRow}>
            <span>Completion alerts</span>
            <div
              className={completionAlerts ? styles.toggleActive : styles.toggleOff}
              onClick={handleToggleAlerts}
              style={{ cursor: unsupported ? "not-allowed" : "pointer", flexShrink: 0 }}
            />
          </div>

          {denied && (
            <p className={styles.notifHint}>
              Notifications are blocked for this site. Open your browser's site settings,
              allow notifications for this page, then tap the toggle again.
            </p>
          )}
          {unsupported && (
            <p className={styles.notifHint}>
              Your browser doesn't support notifications. On iPhone, add this app to your
              Home Screen first, then re-open it.
            </p>
          )}
        </section>

        <section className={styles.section}>
          <label className={styles.sectionLabel}>Danger Zone</label>
          <button className={styles.btnSignOut} onClick={logout}>Sign out</button>
          {confirmLeave ? (
            <div className={styles.confirmLeave}>
              <p className={styles.confirmText}>Are you sure? You will need to create or join a new flat.</p>
              <div className={styles.confirmRow}>
                <button
                  className={styles.btnLeaveConfirm}
                  disabled={leaving}
                  onClick={async () => {
                    setLeaving(true);
                    await leaveFlat();
                  }}
                >
                  {leaving ? "Leaving..." : "Yes, leave"}
                </button>
                <button className={styles.btnCancel} onClick={() => setConfirmLeave(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className={styles.btnLeave} onClick={() => setConfirmLeave(true)}>
              Leave flat
            </button>
          )}
        </section>
      </main>

      <nav className={styles.tabBar}>
        {[
          { name: 'Home', path: '/' },
          { name: 'House', path: '/house' },
          { name: 'Shopping', path: '/shopping' },
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
