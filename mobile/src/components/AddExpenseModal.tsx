import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import ModalSheet, { createFormStyles } from "./ModalSheet";
import MemberMultiSelect from "./MemberMultiSelect";
import SelectDropdown from "./SelectDropdown";
import { useTheme } from "../context/ThemeContext";
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
    // "All" is the default: an empty split means everyone shares it.
    setSplitWith([]);
  }, [visible, currentUserId]);

  // "All" is the resting state: an empty selection (or one covering every
  // member) means everyone. Tapping a member while in the "All" state switches
  // to just that person; selecting everyone again returns to "All".
  const toggleSplit = (userId: string) => {
    setSplitWith((prev) => {
      const isAll = prev.length === 0 || prev.length === members.length;
      if (isAll) return [userId];
      const next = prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId];
      return next.length === members.length ? [] : next;
    });
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
      <SelectDropdown options={CATEGORIES} value={category} onChange={setCategory} placeholder="Select category" />

      <Text style={form.fieldLabel}>Split with</Text>
      <MemberMultiSelect
        members={members}
        selectedIds={splitWith}
        onToggle={toggleSplit}
        placeholder="Select who splits it"
      />
    </ModalSheet>
  );
}
