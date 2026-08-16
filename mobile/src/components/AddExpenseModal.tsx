import React, { useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
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

// The "Log an expense" form, lifted off the bottom of the Splitwise screen so
// that page shows only balances, expenses and settlement history. Opened by
// the tab bar's centre "+".
export default function AddExpenseModal({ visible, members, currentUserId, onClose, onSubmit }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Log an expense</Text>

            <Text style={styles.fieldLabel}>What was it?</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Toilet roll"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              autoFocus
            />

            <Text style={styles.fieldLabel}>Cost</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              value={cost}
              onChangeText={setCost}
            />

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.row}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.chip, category === cat && styles.chipActive]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Split with</Text>
            <View style={styles.row}>
              {members.map((m) => (
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

            <Pressable
              style={[styles.primaryButton, (!valid || submitting) && styles.primaryButtonDisabled]}
              onPress={handleSubmit}
              disabled={!valid || submitting}
            >
              <Text style={styles.primaryButtonText}>Log expense</Text>
            </Pressable>
            <Pressable style={styles.ghostButton} onPress={onClose}>
              <Text style={styles.ghostButtonText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 },
    card: { backgroundColor: colors.surface, borderRadius: 16, padding: 18, maxHeight: "85%" },
    title: {
      fontFamily: fonts.display,
      fontSize: typeScale.subheading,
      letterSpacing: 1,
      color: colors.text,
      marginBottom: 4,
    },
    fieldLabel: {
      fontFamily: fonts.bold,
      fontSize: typeScale.caption,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      color: colors.textMuted,
      marginTop: 14,
      marginBottom: 6,
    },
    input: {
      fontFamily: fonts.regular,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: typeScale.body,
      color: colors.text,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    chip: {
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 16,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { fontFamily: fonts.bold, fontSize: typeScale.caption, color: colors.textMuted },
    chipTextActive: { color: colors.accentText },
    primaryButton: { backgroundColor: colors.accent, borderRadius: 12, padding: 12, alignItems: "center", marginTop: 18 },
    primaryButtonDisabled: { opacity: 0.5 },
    primaryButtonText: {
      fontFamily: fonts.bold,
      color: colors.accentText,
      fontSize: typeScale.caption,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    ghostButton: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      alignItems: "center",
      marginTop: 8,
    },
    ghostButtonText: {
      fontFamily: fonts.bold,
      color: colors.textMuted,
      fontSize: typeScale.caption,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
  });
}
