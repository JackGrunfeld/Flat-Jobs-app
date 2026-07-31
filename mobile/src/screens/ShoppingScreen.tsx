import React, { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import * as shoppingService from "../services/shoppingService";
import * as settlementsService from "../services/settlementsService";
import SettleUpModal from "../components/SettleUpModal";
import type { ShoppingItem, Balance, Settlement } from "../types";

const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// Port of ShoppingListPage.jsx: shopping list + who-owes-who. The balance
// calculation itself now lives server-side (GET /flats/:flatId/balances,
// see workers/src/routes/settlements.ts computeBalances) instead of being
// recomputed on the client, and debts are settleable via the new
// settlements ledger rather than being a read-only number.
export default function ShoppingScreen() {
  const { currentUser, userFlat } = useAuth();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);

  const [itemName, setItemName] = useState("");
  const [itemCost, setItemCost] = useState("");
  const [splitWith, setSplitWith] = useState<string[]>([]);

  const [settleTarget, setSettleTarget] = useState<Balance | null>(null);

  const load = useCallback(async () => {
    if (!userFlat) return;
    const [itemsRes, balancesRes, settlementsRes] = await Promise.all([
      shoppingService.fetchShoppingItems(userFlat.id),
      settlementsService.fetchBalances(userFlat.id),
      settlementsService.fetchSettlements(userFlat.id),
    ]);
    setItems(itemsRes.items);
    setBalances(balancesRes.balances);
    setSettlements(settlementsRes.settlements);
  }, [userFlat]);

  useFocusEffect(
    useCallback(() => {
      load();
      setSplitWith(currentUser ? [currentUser.id] : []);
    }, [load, currentUser]),
  );

  if (!userFlat || !currentUser) return null;

  const nameFor = (userId: string) => userFlat.members.find((m) => m.userId === userId)?.displayName ?? "Unknown";

  const toggleSplit = (userId: string) => {
    setSplitWith((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const addItem = async () => {
    const costCents = Math.round(parseFloat(itemCost || "0") * 100);
    if (!itemName.trim() || !Number.isFinite(costCents) || costCents <= 0) return;
    await shoppingService.addShoppingItem(userFlat.id, { name: itemName.trim(), costCents, splitWith });
    setItemName("");
    setItemCost("");
    await load();
  };

  const deleteItem = async (itemId: string) => {
    await shoppingService.deleteShoppingItem(userFlat.id, itemId);
    await load();
  };

  const submitSettlement = async (amountCents: number, note: string) => {
    if (!settleTarget) return;
    await settlementsService.settleUp(userFlat.id, { toUserId: settleTarget.owesUserId, amountCents, note });
    setSettleTarget(null);
    await load();
  };

  const myBalances = balances.filter((b) => b.userId === currentUser.id || b.owesUserId === currentUser.id);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>Balances</Text>
      {myBalances.length === 0 && <Text style={styles.empty}>All settled up.</Text>}
      {myBalances.map((b, i) => {
        const iOwe = b.userId === currentUser.id;
        return (
          <View key={i} style={styles.balanceRow}>
            <Text style={styles.balanceText}>
              {iOwe ? `You owe ${nameFor(b.owesUserId)}` : `${nameFor(b.userId)} owes you`}{" "}
              <Text style={styles.balanceAmount}>{formatMoney(b.amountCents)}</Text>
            </Text>
            {iOwe && (
              <Pressable style={styles.settleButton} onPress={() => setSettleTarget(b)}>
                <Text style={styles.settleButtonText}>Settle up</Text>
              </Pressable>
            )}
          </View>
        );
      })}

      <Text style={styles.sectionTitle}>Shopping list</Text>
      {items.map((item) => (
        <View key={item.id} style={styles.itemRow}>
          <View style={styles.flex1}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemMeta}>
              {nameFor(item.addedByUserId)} paid {formatMoney(item.costCents)}, split {item.splitWith.length}{" "}
              way{item.splitWith.length === 1 ? "" : "s"}
            </Text>
          </View>
          <Pressable onPress={() => deleteItem(item.id)}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Add an item</Text>
      <TextInput style={styles.input} placeholder="Item name" value={itemName} onChangeText={setItemName} />
      <TextInput
        style={styles.input}
        placeholder="Cost"
        keyboardType="decimal-pad"
        value={itemCost}
        onChangeText={setItemCost}
      />
      <Text style={styles.subLabel}>Split with:</Text>
      <View style={styles.row}>
        {userFlat.members.map((m) => (
          <Pressable
            key={m.userId}
            style={[styles.chip, splitWith.includes(m.userId) && styles.chipActive]}
            onPress={() => toggleSplit(m.userId)}
          >
            <Text style={[styles.chipText, splitWith.includes(m.userId) && styles.chipTextActive]}>
              {m.displayName}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.primaryButton} onPress={addItem}>
        <Text style={styles.primaryButtonText}>Add item</Text>
      </Pressable>

      {settlements.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Settlement history</Text>
          {settlements.map((s) => (
            <Text key={s.id} style={styles.historyRow}>
              {nameFor(s.fromUserId)} → {nameFor(s.toUserId)}: {formatMoney(s.amountCents)}
              {s.note ? ` (${s.note})` : ""}
            </Text>
          ))}
        </>
      )}

      <SettleUpModal
        visible={!!settleTarget}
        counterpartName={settleTarget ? nameFor(settleTarget.owesUserId) : ""}
        suggestedAmountCents={settleTarget?.amountCents ?? 0}
        onClose={() => setSettleTarget(null)}
        onSubmit={submitSettlement}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#6B7280", marginTop: 20, marginBottom: 8, textTransform: "uppercase" },
  empty: { color: "#9CA3AF" },
  balanceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#F9FAFB", borderRadius: 10, padding: 12, marginBottom: 8 },
  balanceText: { fontSize: 15, flex: 1 },
  balanceAmount: { fontWeight: "700" },
  settleButton: { backgroundColor: "#4F46E5", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  settleButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  itemRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 10, padding: 12, marginBottom: 8 },
  flex1: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: "600" },
  itemMeta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  deleteText: { color: "#DC2626", fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 8 },
  subLabel: { fontSize: 13, color: "#6B7280", marginBottom: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { backgroundColor: "#4F46E5", borderColor: "#4F46E5" },
  chipText: { fontSize: 13 },
  chipTextActive: { color: "#fff" },
  primaryButton: { backgroundColor: "#4F46E5", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  historyRow: { fontSize: 13, color: "#6B7280", paddingVertical: 4 },
});
