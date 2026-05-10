import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import styles from "./HousePage.module.css";

const COLOR_OPTIONS = ["#FF7A00", "#FF8FE8", "#4DA6FF", "#3FD47A", "#CCFF66", "#C084FC"];

export default function HousePage() {
  const navigate = useNavigate();
  const location = useLocation();

  // State for collapsible sections
  const [expanded, setExpanded] = useState({ config: true, mates: false, chores: false });
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);

  const toggle = (section) => setExpanded(prev => ({ ...prev, [section]: !prev[section] }));

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.logoSm}>TICK-IT</h1>
        <div className={styles.pageTitle}>House Management</div>
      </header>

      <main className={styles.content}>
        {/* --- SECTION 1: FLAT CONFIG --- */}
        <div className={styles.section} onClick={() => toggle('config')}>
          <div className={styles.sectionLabel}>Flat Configuration {expanded.config ? "−" : "+"}</div>
        </div>
        {expanded.config && (
          <div className={styles.collapsibleBody}>
            <div className={styles.inputRow}>
              <input className={styles.inputText} defaultValue="The Nest" />
              <EditIcon />
            </div>
            <button className={styles.btnOrange}>Save Flat Name</button>
          </div>
        )}

        {/* --- SECTION 2: ADD/MANAGE FLATMATES --- */}
        <div className={styles.section} onClick={() => toggle('mates')}>
          <div className={styles.sectionLabel}>Flatmates {expanded.mates ? "−" : "+"}</div>
        </div>
        {expanded.mates && (
          <div className={styles.collapsibleBody}>
            <div className={styles.inputRow}>
              <input className={styles.inputText} placeholder="e.g. Josh" />
            </div>
            <div className={styles.colorPicker}>
              {COLOR_OPTIONS.map(c => (
                <div 
                  key={c} 
                  className={`${styles.colorSwatch} ${selectedColor === c ? styles.activeColor : ""}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setSelectedColor(c)}
                />
              ))}
            </div>
            <button className={styles.btnGhost}>+ Add Flatmate</button>
            
            {/* Existing Mates */}
            <div className={styles.listContainer}>
               <div className={styles.memberChip} style={{backgroundColor: '#FF7A00'}}>
                  <div className={styles.dot}>FN</div>
                  <div><div className={styles.chipName}>Finn</div><div className={styles.chipSub}>Lounge</div></div>
                  <div className={styles.closeBtn}>×</div>
               </div>
            </div>
          </div>
        )}

        {/* --- SECTION 3: MASTER CHORE LIST --- */}
        <div className={styles.section} onClick={() => toggle('chores')}>
          <div className={styles.sectionLabel}>Chore List {expanded.chores ? "−" : "+"}</div>
        </div>
        {expanded.chores && (
          <div className={styles.collapsibleBody}>
            <div className={styles.choreRow}>
              <div>
                <div className={styles.choreName}>Lounge</div>
                <div className={styles.choreWho}>Weekly · Vacuum and dust</div>
              </div>
              <EditIcon />
            </div>
            <button className={styles.btnGhost}>+ Add New Chore</button>
          </div>
        )}
      </main>

      {/* Shared Navbar */}
      <nav className={styles.tabbar}>
        <div className={styles.tab} onClick={() => navigate('/')}><div className={styles.tabIcon}></div><div className={styles.tabLbl}>Home</div></div>
        <div className={styles.tab} onClick={() => navigate('/house')}><div className={`${styles.tabIcon} ${styles.active}`}></div><div className={`${styles.tabLbl} ${styles.active}`}>Config</div></div>
        <div className={styles.tab} onClick={() => navigate('/settings')}><div className={styles.tabIcon}></div><div className={styles.tabLbl}>Settings</div></div>
      </nav>
    </div>
  );
}

const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 8.5L8.5 2 10 3.5 3.5 10H2V8.5Z" stroke="#FF4B00" strokeWidth="1.2"/></svg>
);