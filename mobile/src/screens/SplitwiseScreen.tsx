import React, { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import * as shoppingService from "../services/shoppingService";
import * as settlementsService from "../services/settlementsService";
import SettleUpModal from "../components/SettleUpModal";
import SettingsButton from "../components/SettingsButton";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import type { ShoppingCategory, ShoppingItem, Balance, Settlement } from "../types";

const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const CATEGORIES: ShoppingCategory[] = ["Food", "Utilities", "Household", "Other"];

// Split out of the old combined Shopping screen (see chat: "$ sign icon
// with the splitwise feature on that tab") — shared expense ledger + who-
// owes-who, now its own tab rather than a section sharing space with the
// plain shopping list.
export default function SplitwiseScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentUser, userFlat } = useAuth();

  const [expenses, setExpenses] = useState<ShoppingItem[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [expenseName, setExpenseName] = useState("");
  const [expenseCost, setExpenseCost] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<ShoppingCategory>("Food");
  const [splitWith, setSplitWith] = useState<string[]>([]);
  const [settleTarget, setSettleTarget] = useState<Balance | null>(null);

  const load = useCallback(async () => {
    if (!userFlat) return;
    const [expensesRes, balancesRes, settlementsRes] = await Promise.all([
      shoppingService.fetchShoppingItems(userFlat.id),
      settlementsService.fetchBalances(userFlat.id),
      settlementsService.fetchSettlements(userFlat.id),
    ]);
    setExpenses(expensesRes.items);
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

  const addExpense = async () => {
    const costCents = Math.round(parseFloat(expenseCost || "0") * 100);
    if (!expenseName.trim() || !Number.isFinite(costCents) || costCents <= 0) return;
    await shoppingService.addShoppingItem(userFlat.id, {
      name: expenseName.trim(),
      costCents,
      splitWith,
      category: expenseCategory,
    });
    setExpenseName("");
    setExpenseCost("");
    setExpenseCategory("Food");
    await load();
  };

  const deleteExpense = async (itemId: string) => {
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
    <View style={styles.root}>
      <ScrollView style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.pageTitle}>Splitwise</Text>

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

        <Text style={styles.sectionTitle}>Expenses</Text>
        {expenses.length === 0 && <Text style={styles.empty}>No expenses logged yet.</Text>}
        {expenses.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.flex1}>
              <View style={styles.itemNameRow}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>{item.category}</Text>
                </View>
              </View>
              <Text style={styles.itemMeta}>
                {nameFor(item.addedByUserId)} paid {formatMoney(item.costCents)}, split {item.splitWith.length}{" "}
                way{item.splitWith.length === 1 ? "" : "s"}
              </Text>
            </View>
            <Pressable onPress={() => deleteExpense(item.id)}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Log an expense</Text>
        <TextInput
          style={styles.input}
          placeholder="What was it?"
          placeholderTextColor={colors.textMuted}
          value={expenseName}
          onChangeText={setExpenseName}
        />
        <TextInput
          style={styles.input}
          placeholder="Cost"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          value={expenseCost}
          onChangeText={setExpenseCost}
        />
        <Text style={styles.subLabel}>Category:</Text>
        <View style={styles.row}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat}
              style={[styles.chip, expenseCategory === cat && styles.chipActive]}
              onPress={() => setExpenseCategory(cat)}
            >
              <Text style={[styles.chipText, expenseCategory === cat && styles.chipTextActive]}>{cat}</Text>
            </Pressable>
          ))}
        </View>
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
        <Pressable style={styles.primaryButton} onPress={addExpense}>
          <Text style={styles.primaryButtonText}>Log expense</Text>
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
      <SettingsButton />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 16, backgroundColor: colors.bg },
  pageTitle: {
    fontFamily: fonts.bold,
    fontSize: typeScale.caption,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: colors.accent,
    textAlign: "center",
    marginBottom: 20,
  },
  sectionTitle: { fontFamily: fonts.bold, fontSize: typeScale.body, color: colors.textMuted, marginTop: 20, marginBottom: 8, textTransform: "uppercase" },
  empty: { fontFamily: fonts.regular, color: colors.textMuted },
  flex1: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  balanceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 8 },
  balanceText: { fontFamily: fonts.regular, fontSize: typeScale.body, flex: 1, color: colors.text },
  balanceAmount: { fontFamily: fonts.bold, color: colors.text },
  settleButton: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  settleButtonText: { fontFamily: fonts.bold, color: "#fff", fontSize: typeScale.body },
  itemRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 8 },
  itemNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemName: { fontFamily: fonts.bold, fontSize: typeScale.body, color: colors.text },
  itemMeta: { fontFamily: fonts.regular, fontSize: typeScale.caption, color: colors.textMuted, marginTop: 2 },
  categoryBadge: { backgroundColor: colors.accentSoft, borderRadius: 4, paddingVertical: 2, paddingHorizontal: 6 },
  categoryBadgeText: {
    fontFamily: fonts.bold,
    fontSize: typeScale.caption,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.accent,
  },
  deleteText: { fontFamily: fonts.bold, color: colors.danger },
  input: { fontFamily: fonts.regular, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 8, padding: 10, fontSize: typeScale.body, marginBottom: 8, color: colors.text },
  subLabel: { fontFamily: fonts.regular, fontSize: typeScale.body, color: colors.textMuted, marginBottom: 6 },
  chip: { borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontFamily: fonts.regular, fontSize: typeScale.body, color: colors.text },
  chipTextActive: { color: "#fff" },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  primaryButtonText: { fontFamily: fonts.bold, color: "#fff", fontSize: typeScale.body },
  historyRow: { fontFamily: fonts.regular, fontSize: typeScale.body, color: colors.textMuted, paddingVertical: 4 },
  });
}
