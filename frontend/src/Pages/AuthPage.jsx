import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import styles from "./AuthPage.module.css";

const ERROR_MAP = {
  "auth/user-not-found": "No account found with that email.",
  "auth/wrong-password": "Incorrect password.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/too-many-requests": "Too many attempts. Please try again later.",
};

function friendlyError(err) {
  const code = err.code || "";
  return ERROR_MAP[code] || err.message.replace("Firebase: ", "").replace(/ \(auth\/.*\)\.?/, "");
}

export default function AuthPage() {
  const { signup, login } = useAuth();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = (m) => { setMode(m); setError(""); };

  const handleSubmit = async () => {
    setError("");
    if (!email.trim() || !password) { setError("Please fill in all fields."); return; }
    if (mode === "signup" && !name.trim()) { setError("Please enter your name."); return; }
    setLoading(true);
    try {
      if (mode === "signup") {
        await signup(name.trim(), email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
    } catch (e) {
      setError(friendlyError(e));
    }
    setLoading(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.logo}>TICK-IT</h1>
        <p className={styles.tagline}>Flat life, organised.</p>

        <div className={styles.modeTabs}>
          <button
            className={`${styles.modeTab} ${mode === "login" ? styles.modeTabActive : ""}`}
            onClick={() => switchMode("login")}
          >
            Log In
          </button>
          <button
            className={`${styles.modeTab} ${mode === "signup" ? styles.modeTabActive : ""}`}
            onClick={() => switchMode("signup")}
          >
            Sign Up
          </button>
        </div>

        {mode === "signup" && (
          <div className={styles.inputRow}>
            <input
              className={styles.input}
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
        )}

        <div className={styles.inputRow}>
          <input
            className={styles.input}
            placeholder="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>

        <div className={styles.inputRow}>
          <input
            className={styles.input}
            placeholder="Password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.btnSubmit} onClick={handleSubmit} disabled={loading}>
          {loading ? "Please wait..." : mode === "login" ? "Log In" : "Create Account"}
        </button>
      </div>
    </div>
  );
}
