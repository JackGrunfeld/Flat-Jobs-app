import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { inviteByEmail, updateFlatName } from "../services/flatService";
import { fetchChores, addChore, deleteChore, updateChore } from "../services/api";
import styles from "./HousePage.module.css";

const PALETTE = ["#FF7A00", "#FF8FE8", "#2bcf47", "#897ee9", "#CCFF66", "#4DA6FF", "#C084FC"];
const FREQUENCIES = ["Daily", "Weekly", "Monthly"];

export default function HousePage() {
  const navigate = useNavigate();
  const { userFlat, refreshFlat, currentUser } = useAuth();

  const [expanded, setExpanded] = useState({ config: true, mates: false, invite: false, chores: false });
  const toggle = (s) => setExpanded(prev => ({ ...prev, [s]: !prev[s] }));

  // ── Flat name ──
  const [flatName, setFlatName] = useState(userFlat?.name || "");
  const [savingName, setSavingName] = useState(false);
  useEffect(() => { setFlatName(userFlat?.name || ""); }, [userFlat?.name]);

  const handleSaveName = async () => {
    if (!flatName.trim() || flatName.trim() === userFlat?.name) return;
    setSavingName(true);
    await updateFlatName(userFlat.id, flatName.trim());
    await refreshFlat(currentUser.uid);
    setSavingName(false);
  };

  // ── Invite ──
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitedEmails, setInvitedEmails] = useState(userFlat?.invitedEmails || []);
  const [inviting, setInviting] = useState(false);

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviting(true);
    await inviteByEmail(userFlat.id, email, {
      flatName: userFlat.name,
      flatCode: userFlat.code,
      inviterName: currentUser.displayName,
    });
    setInvitedEmails(prev => [...new Set([...prev, email])]);
    setInviteEmail("");
    setInviting(false);
  };

  // ── Members ──
  const members = (userFlat?.memberIds || []).map((uid, i) => ({
    uid,
    name: userFlat.memberNames?.[uid] || uid,
    color: userFlat.memberColors?.[uid] || PALETTE[i % PALETTE.length],
    initials: (userFlat.memberNames?.[uid] || "?").slice(0, 2).toUpperCase(),
  }));

  // ── Chores ──
  const [chores, setChores] = useState([]);
  const [expandedChore, setExpandedChore] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFreq, setNewFreq] = useState("Weekly");
  const [newMemberIds, setNewMemberIds] = useState([]);
  const [newDesc, setNewDesc] = useState("");
  const [addingChore, setAddingChore] = useState(false);

  // ── Edit chore ──
  const [editingChoreId, setEditingChoreId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editFreq, setEditFreq] = useState("Weekly");
  const [editMemberIds, setEditMemberIds] = useState([]);
  const [editDesc, setEditDesc] = useState("");
  const [savingChore, setSavingChore] = useState(false);

  useEffect(() => {
    if (!userFlat?.id) return;
    fetchChores(userFlat.id).then(setChores);
  }, [userFlat?.id]);

  const toggleChoreMember = (uid) =>
    setNewMemberIds(prev => prev.includes(uid) ? prev.filter(u => u !== uid) : [...prev, uid]);

  const handleAddChore = async () => {
    if (!newName.trim()) return;
    setAddingChore(true);
    const chore = await addChore(userFlat.id, {
      name: newName.trim(),
      description: newDesc.trim(),
      frequency: newFreq,
      memberIds: newMemberIds,
    });
    setChores(prev => [...prev, chore]);
    setNewName(""); setNewFreq("Weekly"); setNewMemberIds([]); setNewDesc("");
    setShowAddForm(false);
    setAddingChore(false);
  };

  const handleDeleteChore = async (id) => {
    await deleteChore(userFlat.id, id);
    setChores(prev => prev.filter(c => c.id !== id));
  };

  const startEditChore = (chore) => {
    setEditingChoreId(chore.id);
    setEditName(chore.name);
    setEditFreq(chore.frequency || "Weekly");
    setEditMemberIds(chore.memberIds || []);
    setEditDesc(chore.description || "");
    setExpandedChore(chore.id);
  };

  const cancelEdit = () => {
    setEditingChoreId(null);
  };

  const handleSaveChore = async () => {
    if (!editName.trim()) return;
    setSavingChore(true);
    const updates = { name: editName.trim(), frequency: editFreq, memberIds: editMemberIds, description: editDesc.trim() };
    await updateChore(userFlat.id, editingChoreId, updates);
    setChores(prev => prev.map(c => c.id === editingChoreId ? { ...c, ...updates } : c));
    setEditingChoreId(null);
    setSavingChore(false);
  };

  const toggleEditMember = (uid) =>
    setEditMemberIds(prev => prev.includes(uid) ? prev.filter(u => u !== uid) : [...prev, uid]);

  const resetAddForm = () => {
    setShowAddForm(false);
    setNewName(""); setNewFreq("Weekly"); setNewMemberIds([]); setNewDesc("");
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.logoSm}>TICK-IT</h1>
        <div className={styles.pageTitle}>House Management</div>
      </header>

      <main className={styles.content}>

        {/* ── FLAT CONFIG ── */}
        <div className={styles.section} onClick={() => toggle("config")}>
          <div className={styles.sectionLabel}>Flat Configuration {expanded.config ? "−" : "+"}</div>
        </div>
        {expanded.config && (
          <div className={styles.collapsibleBody}>
            <div className={styles.inputRow}>
              <input
                className={styles.inputText}
                value={flatName}
                onChange={e => setFlatName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSaveName()}
              />
              <EditIcon />
            </div>
            <button className={styles.btnOrange} onClick={handleSaveName} disabled={savingName || !flatName.trim()}>
              {savingName ? "Saving..." : "Save Flat Name"}
            </button>
            <div className={styles.codeRow}>
              <span className={styles.codeLabel}>Flat Code</span>
              <span className={styles.code}>{userFlat?.code}</span>
            </div>
            <p className={styles.codeHint}>Share this code so flatmates can join.</p>
          </div>
        )}

        {/* ── FLATMATES ── */}
        <div className={styles.section} onClick={() => toggle("mates")}>
          <div className={styles.sectionLabel}>Flatmates {expanded.mates ? "−" : "+"}</div>
        </div>
        {expanded.mates && (
          <div className={styles.collapsibleBody}>
            <div className={styles.listContainer}>
              {members.map(m => (
                <div key={m.uid} className={styles.memberChip} style={{ backgroundColor: m.color }}>
                  <div className={styles.dot}>{m.initials}</div>
                  <div className={styles.chipName}>{m.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── INVITE ── */}
        <div className={styles.section} onClick={() => toggle("invite")}>
          <div className={styles.sectionLabel}>Invite Flatmates {expanded.invite ? "−" : "+"}</div>
        </div>
        {expanded.invite && (
          <div className={styles.collapsibleBody}>
            <div className={styles.inviteRow}>
              <div className={styles.inputRow} style={{ flex: 1, marginBottom: 0 }}>
                <input
                  className={styles.inputText}
                  placeholder="flatmate@email.com"
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleInvite()}
                />
              </div>
              <button className={styles.btnSend} onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                {inviting ? "..." : "Send"}
              </button>
            </div>
            {invitedEmails.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className={styles.choreWho}>Pending invites:</div>
                {invitedEmails.map(e => (
                  <div key={e} className={styles.pendingInvite}>{e}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CHORE LIST ── */}
        <div className={styles.section} onClick={() => toggle("chores")}>
          <div className={styles.sectionLabel}>Chore List {expanded.chores ? "−" : "+"}</div>
        </div>
        {expanded.chores && (
          <div className={styles.collapsibleBody}>

            {chores.length === 0 && !showAddForm && (
              <div className={styles.emptyChores}>No chores yet — add one below.</div>
            )}

            {chores.map(chore => {
              const choreMembers = members.filter(m => chore.memberIds?.includes(m.uid));
              const isOpen = expandedChore === chore.id;
              const isEditing = editingChoreId === chore.id;
              return (
                <div key={chore.id} className={styles.choreCard2}>
                  <div
                    className={styles.choreCard2Header}
                    onClick={() => !isEditing && setExpandedChore(isOpen ? null : chore.id)}
                  >
                    <div>
                      <div className={styles.choreName2}>{chore.name}</div>
                      <div className={styles.choreFreqBadge}>{chore.frequency}</div>
                    </div>
                    <div className={styles.choreCard2Right}>
                      <button
                        className={styles.deleteChoreBtn}
                        onClick={e => { e.stopPropagation(); startEditChore(chore); }}
                        title="Edit"
                      >
                        ✎
                      </button>
                      <button
                        className={styles.deleteChoreBtn}
                        onClick={e => { e.stopPropagation(); handleDeleteChore(chore.id); }}
                        title="Delete"
                      >
                        ×
                      </button>
                      <span className={styles.chevron}>{isOpen ? "−" : "+"}</span>
                    </div>
                  </div>

                  {isOpen && !isEditing && (
                    <div className={styles.choreCard2Body}>
                      {chore.description ? (
                        <p className={styles.choreDesc}>{chore.description}</p>
                      ) : (
                        <p className={styles.choreDescEmpty}>No description.</p>
                      )}
                      {choreMembers.length > 0 ? (
                        <div className={styles.choreMemberRow}>
                          {choreMembers.map(m => (
                            <span
                              key={m.uid}
                              className={styles.choreMemberChip}
                              style={{ backgroundColor: m.color }}
                            >
                              {m.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.choreDescEmpty}>All flatmates.</div>
                      )}
                    </div>
                  )}

                  {isEditing && (
                    <div className={styles.choreCard2Body}>
                      <div className={styles.formFieldLabel}>Chore name</div>
                      <div className={styles.inputRow}>
                        <input
                          className={styles.inputText}
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                        />
                      </div>

                      <div className={styles.formFieldLabel}>Frequency</div>
                      <div className={styles.freqSelector}>
                        {FREQUENCIES.map(f => (
                          <button
                            key={f}
                            className={`${styles.freqBtn} ${editFreq === f ? styles.freqBtnActive : ""}`}
                            onClick={() => setEditFreq(f)}
                          >
                            {f}
                          </button>
                        ))}
                      </div>

                      <div className={styles.formFieldLabel}>Rotation members</div>
                      <div className={styles.choreFormChips}>
                        {members.map(m => (
                          <button
                            key={m.uid}
                            className={`${styles.choreFormChip} ${editMemberIds.includes(m.uid) ? styles.choreFormChipActive : ""}`}
                            style={editMemberIds.includes(m.uid) ? { backgroundColor: m.color, color: "#000", borderColor: "transparent" } : {}}
                            onClick={() => toggleEditMember(m.uid)}
                          >
                            {m.name}
                          </button>
                        ))}
                        <button
                          className={`${styles.choreFormChip} ${editMemberIds.length === 0 ? styles.choreFormChipAllActive : ""}`}
                          onClick={() => setEditMemberIds([])}
                        >
                          All
                        </button>
                      </div>

                      <div className={styles.formFieldLabel}>Description</div>
                      <div className={styles.inputRow}>
                        <textarea
                          className={styles.inputTextarea}
                          value={editDesc}
                          onChange={e => setEditDesc(e.target.value)}
                          rows={3}
                        />
                      </div>

                      <button
                        className={styles.btnOrange}
                        onClick={handleSaveChore}
                        disabled={savingChore || !editName.trim()}
                      >
                        {savingChore ? "Saving..." : "Save Changes"}
                      </button>
                      <button className={styles.btnGhost} onClick={cancelEdit}>Cancel</button>
                    </div>
                  )}
                </div>
              );
            })}

            {showAddForm ? (
              <div className={styles.addChoreForm}>
                <div className={styles.formFieldLabel}>Chore name</div>
                <div className={styles.inputRow}>
                  <input
                    className={styles.inputText}
                    placeholder="e.g. Vacuum living room"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                  />
                </div>

                <div className={styles.formFieldLabel}>Frequency</div>
                <div className={styles.freqSelector}>
                  {FREQUENCIES.map(f => (
                    <button
                      key={f}
                      className={`${styles.freqBtn} ${newFreq === f ? styles.freqBtnActive : ""}`}
                      onClick={() => setNewFreq(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <div className={styles.formFieldLabel}>Rotation members</div>
                <div className={styles.choreFormChips}>
                  {members.map(m => (
                    <button
                      key={m.uid}
                      className={`${styles.choreFormChip} ${newMemberIds.includes(m.uid) ? styles.choreFormChipActive : ""}`}
                      style={newMemberIds.includes(m.uid) ? { backgroundColor: m.color, color: "#000", borderColor: "transparent" } : {}}
                      onClick={() => toggleChoreMember(m.uid)}
                    >
                      {m.name}
                    </button>
                  ))}
                  <button
                    className={`${styles.choreFormChip} ${newMemberIds.length === 0 ? styles.choreFormChipAllActive : ""}`}
                    onClick={() => setNewMemberIds([])}
                  >
                    All
                  </button>
                </div>

                <div className={styles.formFieldLabel}>Description</div>
                <div className={styles.inputRow}>
                  <textarea
                    className={styles.inputTextarea}
                    placeholder="What needs to be done? (optional)"
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    rows={3}
                  />
                </div>

                <button
                  className={styles.btnOrange}
                  onClick={handleAddChore}
                  disabled={addingChore || !newName.trim()}
                >
                  {addingChore ? "Adding..." : "Add Chore"}
                </button>
                <button className={styles.btnGhost} onClick={resetAddForm}>Cancel</button>
              </div>
            ) : (
              <button className={styles.btnGhost} onClick={() => setShowAddForm(true)}>
                + Add New Chore
              </button>
            )}
          </div>
        )}

      </main>

      <nav className={styles.tabbar}>
        <div className={styles.tab} onClick={() => navigate("/")}><div className={styles.tabIcon} /><div className={styles.tabLbl}>Home</div></div>
        <div className={styles.tab} onClick={() => navigate("/house")}><div className={`${styles.tabIcon} ${styles.active}`} /><div className={`${styles.tabLbl} ${styles.active}`}>Config</div></div>
        <div className={styles.tab} onClick={() => navigate("/shopping")}><div className={styles.tabIcon} /><div className={styles.tabLbl}>Shopping</div></div>
        <div className={styles.tab} onClick={() => navigate("/settings")}><div className={styles.tabIcon} /><div className={styles.tabLbl}>Settings</div></div>
      </nav>
    </div>
  );
}

const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M2 8.5L8.5 2 10 3.5 3.5 10H2V8.5Z" stroke="#FF4B00" strokeWidth="1.2" />
  </svg>
);
