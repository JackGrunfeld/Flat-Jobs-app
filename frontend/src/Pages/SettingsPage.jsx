import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import styles from "./SettingsPage.module.css";

export default function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();

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
            <span className={styles.val}>Jack</span>
          </div>
          <div className={styles.settingRow}>
            <span>Flat</span>
            <span className={styles.val}>The Nest</span>
          </div>
        </section>

        <section className={styles.section}>
          <label className={styles.sectionLabel}>Notifications</label>
          <div className={styles.settingRow}>
            <span>Weekly reminder</span>
            <div className={styles.toggleActive}></div>
          </div>
          <div className={styles.settingRow}>
            <span>Completion alerts</span>
            <div className={styles.toggleOff}></div>
          </div>
        </section>

        <section className={styles.section}>
          <label className={styles.sectionLabel}>Danger Zone</label>
          <button className={styles.btnSignOut}>Sign out</button>
        </section>
      </main>

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