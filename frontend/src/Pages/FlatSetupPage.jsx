import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { createFlat, joinFlatByCode, inviteByEmail, checkEmailInvite } from "../services/flatService";
import styles from "./FlatSetupPage.module.css";

export default function FlatSetupPage() {
  const { currentUser, logout, refreshFlat } = useAuth();
  const userName = currentUser?.displayName || currentUser?.email || "there";

  const [view, setView] = useState("choice"); // "choice" | "create" | "created" | "join"
  const [flatName, setFlatName] = useState("");
  const [createdFlat, setCreatedFlat] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitedEmails, setInvitedEmails] = useState([]);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // On mount, check if this user's email was invited to any flat.
  // Also polls briefly in case signup's own checkEmailInvite hasn't finished yet
  // (the race-condition window where onAuthStateChanged fires before the name is set).
  useEffect(() => {
    let cancelled = false;
    console.log("[Setup] mount — checking email invite, displayName set:", !!currentUser.displayName);

    const check = async () => {
      console.log("[Setup] checkEmailInvite attempt 1…");
      const flatId = await checkEmailInvite(
        currentUser.uid,
        currentUser.email,
        currentUser.displayName || null
      );
      if (cancelled) return;
      if (flatId) {
        console.log("[Setup] invite found on attempt 1");
        refreshFlat(currentUser.uid);
        return;
      }
      console.log("[Setup] no invite on attempt 1 — waiting 1.5s then retrying…");
      // Not found yet — wait briefly then try once more (handles the signup race window)
      await new Promise(r => setTimeout(r, 1500));
      if (cancelled) return;
      console.log("[Setup] checkEmailInvite attempt 2…");
      const flatId2 = await checkEmailInvite(
        currentUser.uid,
        currentUser.email,
        currentUser.displayName || null
      );
      if (!cancelled && flatId2) {
        console.log("[Setup] invite found on attempt 2");
        refreshFlat(currentUser.uid);
      }
      if (!cancelled) {
        console.log("[Setup] no invite found after 2 attempts — showing setup UI");
        setChecking(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, []);

  const handleCreate = async () => {
    if (!flatName.trim()) return;
    setError("");
    setLoading(true);
    console.log("[Setup] handleCreate — start");
    try {
      const flat = await createFlat({
        uid: currentUser.uid,
        flatName: flatName.trim(),
        userEmail: currentUser.email,
        userName,
      });
      console.log("[Setup] handleCreate — success");
      setCreatedFlat(flat);
      setView("created");
    } catch (e) {
      console.error("[Setup] handleCreate error →", e.message);
      setError(e.message);
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setError("");
    setLoading(true);
    console.log("[Setup] handleJoin — start");
    try {
      await joinFlatByCode({
        uid: currentUser.uid,
        code: joinCode,
        userEmail: currentUser.email,
        userName,
      });
      console.log("[Setup] joinFlatByCode success — refreshing flat…");
      await refreshFlat(currentUser.uid);
    } catch (e) {
      console.error("[Setup] handleJoin error →", e.message);
      setError(e.message);
    }
    setLoading(false);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !createdFlat) return;
    console.log("[Setup] handleInvite — sending invite");
    await inviteByEmail(createdFlat.id, inviteEmail.trim());
    setInvitedEmails(prev => [...prev, inviteEmail.trim().toLowerCase()]);
    setInviteEmail("");
  };

  const handleEnterApp = () => {
    console.log("[Setup] handleEnterApp — refreshing flat for uid:", currentUser.uid);
    refreshFlat(currentUser.uid);
  };

  if (checking) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#FF4B00", fontFamily: "Space Grotesk", fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>
          Checking invite...
        </span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <h1 className={styles.logo}>hommies</h1>
        <p className={styles.welcome}>Hey, {userName}.</p>

        {/* CHOICE */}
        {view === "choice" && (
          <>
            <p className={styles.hint}>Create a new flat or join one with a code.</p>
            <button className={styles.btnOrange} onClick={() => { setView("create"); setError(""); }}>
              Create a Flat
            </button>
            <button className={styles.btnGhost} onClick={() => { setView("join"); setError(""); }}>
              Join a Flat
            </button>
          </>
        )}

        {/* CREATE */}
        {view === "create" && (
          <>
            <p className={styles.hint}>What's your flat called?</p>
            <div className={styles.inputRow}>
              <input
                className={styles.input}
                placeholder="e.g. The Nest"
                value={flatName}
                onChange={e => setFlatName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
              />
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btnOrange} onClick={handleCreate} disabled={loading || !flatName.trim()}>
              {loading ? "Creating..." : "Create Flat"}
            </button>
            <button className={styles.btnBack} onClick={() => { setView("choice"); setError(""); }}>← Back</button>
          </>
        )}

        {/* CREATED */}
        {view === "created" && createdFlat && (
          <>
            <p className={styles.hint}>Share this with your flatmates:</p>

            <div className={styles.codeBox}>
              <span className={styles.codeLabel}>Flat Code</span>
              <span className={styles.code}>{createdFlat.code}</span>
            </div>

            <div className={styles.inviteSection}>
              <p className={styles.inviteTitle}>Invite by email</p>
              <div className={styles.inviteRow}>
                <div className={styles.inputRow} style={{ flex: 1, marginBottom: 0 }}>
                  <input
                    className={styles.input}
                    placeholder="flatmate@email.com"
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleInvite()}
                  />
                </div>
                <button className={styles.btnSend} onClick={handleInvite}>Send</button>
              </div>
              {invitedEmails.map(e => (
                <p key={e} className={styles.inviteSent}>✓ Invited {e}</p>
              ))}
            </div>

            <button className={styles.btnOrange} onClick={handleEnterApp}>
              Enter App →
            </button>
          </>
        )}

        {/* JOIN */}
        {view === "join" && (
          <>
            <p className={styles.hint}>Enter the 6-character flat code:</p>
            <div className={styles.inputRow}>
              <input
                className={`${styles.input} ${styles.codeInput}`}
                placeholder="ABC123"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                maxLength={6}
                onKeyDown={e => e.key === "Enter" && handleJoin()}
              />
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btnOrange} onClick={handleJoin} disabled={loading || joinCode.length < 6}>
              {loading ? "Joining..." : "Join Flat"}
            </button>
            <button className={styles.btnBack} onClick={() => { setView("choice"); setError(""); setJoinCode(""); }}>← Back</button>
          </>
        )}

        <button className={styles.btnLogout} onClick={logout}>Log out</button>
      </div>
    </div>
  );
}
