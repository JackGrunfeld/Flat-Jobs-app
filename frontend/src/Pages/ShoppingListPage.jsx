import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { fetchShoppingItems, addShoppingItem, deleteShoppingItem } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import styles from "./ShoppingListPage.module.css";

const PALETTE = ["#FF7A00", "#FF8FE8", "#2bcf47", "#897ee9", "#CCFF66", "#4DA6FF", "#C084FC"];

function calcOwes(items) {
  // Build raw[debtor][creditor] = total owed
  const raw = {};
  items.forEach(({ addedBy, cost, splitWith }) => {
    if (!addedBy || !splitWith?.length) return;
    const perPerson = cost / splitWith.length;
    splitWith.forEach(person => {
      if (person === addedBy) return;
      if (!raw[person]) raw[person] = {};
      raw[person][addedBy] = (raw[person][addedBy] || 0) + perPerson;
    });
  });

  // Net out mutual debts so we don't show A→B and B→A separately
  const seen = new Set();
  const result = [];
  Object.entries(raw).forEach(([debtor, creditors]) => {
    Object.entries(creditors).forEach(([creditor, amount]) => {
      const key = [debtor, creditor].sort().join("|");
      if (seen.has(key)) return;
      seen.add(key);
      const reverse = raw[creditor]?.[debtor] || 0;
      const net = amount - reverse;
      if (net > 0.005) result.push({ debtor, creditor, amount: net });
      else if (net < -0.005) result.push({ debtor: creditor, creditor: debtor, amount: -net });
    });
  });
  return result;
}

export default function ShoppingListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userFlat } = useAuth();

  // Build member list and colour map from the live flat data
  const members = (userFlat?.memberIds || [])
    .map(uid => userFlat.memberNames?.[uid])
    .filter(Boolean);

  const personColors = {};
  (userFlat?.memberIds || []).forEach((uid, i) => {
    const name = userFlat.memberNames?.[uid];
    if (name) personColors[name] = userFlat.memberColors?.[uid] || PALETTE[i % PALETTE.length];
  });

  const [items, setItems] = useState([]);
  const [itemName, setItemName] = useState("");
  const [cost, setCost] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [selectedMates, setSelectedMates] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userFlat?.id) return;
    fetchShoppingItems(userFlat.id).then(setItems);
  }, [userFlat?.id]);

  const toggleMate = (mate) => {
    setSelectedMates(prev =>
      prev.includes(mate) ? prev.filter(m => m !== mate) : [...prev, mate]
    );
  };

  const handleAdd = async () => {
    if (!itemName.trim() || !cost || !paidBy || selectedMates.length === 0) return;
    setLoading(true);
    const newItem = await addShoppingItem(userFlat.id, {
      name: itemName.trim(),
      cost: parseFloat(parseFloat(cost).toFixed(2)),
      addedBy: paidBy,
      splitWith: selectedMates,
    });
    setItems(prev => [newItem, ...prev]);
    setItemName("");
    setCost("");
    setPaidBy("");
    setSelectedMates([]);
    setLoading(false);
  };

  const handleDelete = async (id) => {
    await deleteShoppingItem(userFlat.id, id);
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const [collapsedDebtors, setCollapsedDebtors] = useState({});

  const toggleDebtor = (name) =>
    setCollapsedDebtors(prev => ({ ...prev, [name]: !prev[name] }));

  const owes = calcOwes(items);
  const owesByDebtor = owes.reduce((acc, { debtor, creditor, amount }) => {
    if (!acc[debtor]) acc[debtor] = [];
    acc[debtor].push({ creditor, amount });
    return acc;
  }, {});

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.logo}>TICK-IT</h1>
        <div className={styles.pageTitle}>Shopping List</div>
      </header>

      <main className={styles.content}>

        {/* Totals summary */}
        {Object.keys(owesByDebtor).length > 0 && (
          <>
            <h2 className={styles.sectionTitle}>Who Owes Who</h2>
            {Object.entries(owesByDebtor).map(([debtor, debts]) => {
              const total = debts.reduce((sum, d) => sum + d.amount, 0);
              const isOpen = !collapsedDebtors[debtor];
              return (
                <div key={debtor} className={styles.debtorCard}>
                  <button className={styles.debtorHeader} onClick={() => toggleDebtor(debtor)}>
                    <span className={styles.debtorName} style={{ color: personColors[debtor] }}>{debtor}</span>
                    <div className={styles.debtorHeaderRight}>
                      <span className={styles.debtorTotal}>${total.toFixed(2)}</span>
                      <span className={styles.chevron}>{isOpen ? '−' : '+'}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className={styles.debtorBody}>
                      {debts.map(({ creditor, amount }) => (
                        <div key={creditor} className={styles.debtLine}>
                          <span className={styles.debtTo}>
                            owes <span style={{ color: personColors[creditor] }}>{creditor}</span>
                          </span>
                          <span className={styles.debtAmount}>${amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Add Item form */}
        <div className={styles.formCard}>
          <h2 className={styles.formTitle}>Add Item</h2>

          <div className={styles.inputRow}>
            <input
              className={styles.inputText}
              placeholder="Item name"
              value={itemName}
              onChange={e => setItemName(e.target.value)}
            />
          </div>

          <div className={styles.inputRow}>
            <span className={styles.currencySymbol}></span>
            <input
              className={styles.inputText}
              placeholder="0.00"
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={e => setCost(e.target.value)}
            />
          </div>

          <div className={styles.splitLabel}>Paid by</div>
          <div className={styles.mateChips}>
            {members.map(mate => (
              <button
                key={mate}
                className={`${styles.mateChip} ${paidBy === mate ? styles.mateChipActive : ""}`}
                style={paidBy === mate ? { backgroundColor: personColors[mate], color: "#000", borderColor: "transparent" } : {}}
                onClick={() => setPaidBy(prev => prev === mate ? "" : mate)}
              >
                {mate}
              </button>
            ))}
          </div>

          <div className={styles.splitLabel}>Split with</div>
          <div className={styles.mateChips}>
            {members.map(mate => (
              <button
                key={mate}
                className={`${styles.mateChip} ${selectedMates.includes(mate) ? styles.mateChipActive : ""}`}
                style={selectedMates.includes(mate) ? { backgroundColor: personColors[mate], color: "#000", borderColor: "transparent" } : {}}
                onClick={() => toggleMate(mate)}
              >
                {mate}
              </button>
            ))}
          </div>

          <button
            className={styles.btnAdd}
            onClick={handleAdd}
            disabled={loading || !itemName.trim() || !cost || !paidBy || selectedMates.length === 0}
          >
            {loading ? "Adding..." : "+ Add Item"}
          </button>
        </div>

        <h2 className={styles.sectionTitle}>Items</h2>

        {items.length === 0 && (
          <div className={styles.emptyState}>No items yet — add one above.</div>
        )}

        {items.map(item => {
          const perPerson = (item.cost / item.splitWith.length).toFixed(2);
          return (
            <div key={item.id} className={styles.itemCard}>
              <div className={styles.itemHeader}>
                <div>
                  <span className={styles.itemName}>{item.name}</span>
                  {item.addedBy && (
                    <span className={styles.itemPaidBy} style={{ color: personColors[item.addedBy] }}>
                      paid by {item.addedBy}
                    </span>
                  )}
                </div>
                <div className={styles.itemRight}>
                  <span className={styles.itemTotal}>${item.cost.toFixed(2)}</span>
                  <button className={styles.deleteBtn} onClick={() => handleDelete(item.id)}>×</button>
                </div>
              </div>
              <div className={styles.splitRow}>
                {item.splitWith.map(mate => (
                  <div key={mate} className={styles.owesChip} style={{ borderColor: personColors[mate] }}>
                    <span className={styles.owesName} style={{ color: personColors[mate] }}>{mate}</span>
                    <span className={styles.owesAmount}>${perPerson}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
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
