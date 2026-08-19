import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import ModalSheet, { createFormStyles } from "./ModalSheet";
import { useTheme } from "../context/ThemeContext";
import { inkFor } from "../theme/cardInk";
import type { FlatMember, ShoppingCategory } from "../types";

export const CATEGORIES: ShoppingCategory[] = ["Food", "Utilities", "Household", "Other"];

export type NewExpense = {
  name: string;
  costCents: number;
  category: ShoppingCategory;
  splitWith: string[];
};

type Props = {
  visible: boolean;
  members: FlatMember[];
  // Pre-selected in the split, since the person logging an expense is almost
  // always part of it.
  currentUserId: string;
  onClose: () => void;
  onSubmit: (expense: NewExpense) => Promise<void>;
};

// The "Log an expense" form, lifted off the bottom of the Bills screen so
// that page shows only balances, expenses and settlement history. Opened by
// the tab bar's centre "+".
export default function AddExpenseModal({ visible, members, currentUserId, onClose, onSubmit }: Props) {
  const { colors } = useTheme();
  const form = useMemo(() => createFormStyles(colors), [colors]);

  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [category, setCategory] = useState<ShoppingCategory>("Food");
  const [splitWith, setSplitWith] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName("");
    setCost("");
    setCategory("Food");
    setSplitWith([currentUserId]);
  }, [visible, currentUserId]);

  const toggleSplit = (userId: string) => {
    setSplitWith((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const costCents = Math.round(parseFloat(cost || "0") * 100);
  const valid = !!name.trim() && Number.isFinite(costCents) && costCents > 0;

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), costCents, category, splitWith });
      onClose();
    } catch (err) {
      console.warn("Failed to log expense", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSheet
      visible={visible}
      title="Log an expense"
      onClose={onClose}
      footer={
        <Pressable
          style={[form.primaryButton, (!valid || submitting) && form.primaryButtonDisabled]}
          onPress={handleSubmit}
          disabled={!valid || submitting}
        >
          <Text style={form.primaryButtonText}>Log expense</Text>
        </Pressable>
      }
    >
      <Text style={form.fieldLabel}>What was it?</Text>
      <TextInput
        style={form.input}
        placeholder="e.g. Toilet roll"
        placeholderTextColor={colors.textMuted}
        value={name}
        onChangeText={setName}
        autoFocus
      />

      <Text style={form.fieldLabel}>Cost</Text>
      <TextInput
        style={form.input}
        placeholder="0.00"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        value={cost}
        onChangeText={setCost}
      />

      <Text style={form.fieldLabel}>Category</Text>
      <View style={form.row}>
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            style={[form.chip, category === cat && form.chipActive]}
            onPress={() => setCategory(cat)}
          >
            <Text style={[form.chipText, category === cat && form.chipTextActive]}>{cat}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={form.fieldLabel}>Split with</Text>
      <View style={form.row}>
        {members.map((m) => {
          const active = splitWith.includes(m.userId);
          // Picks up the flatmate's own colour when they're in the split, the
          // same way the chore rotation chips do — and their colour decides
          // the ink, since a pastel takes black and a deep one takes white.
          const fill = m.color ?? colors.accent;
          return (
            <Pressable
              key={m.userId}
              style={[form.chip, active && { backgroundColor: fill, borderColor: "transparent" }]}
              onPress={() => toggleSplit(m.userId)}
            >
              <Text style={[form.chipText, active && { color: inkFor(fill).strong }]}>{m.displayName}</Text>
            </Pressable>
          );
        })}
      </View>
    </ModalSheet>
  );
}
