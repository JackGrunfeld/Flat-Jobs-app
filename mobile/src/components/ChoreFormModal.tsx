import React, { useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import type { Chore, FlatMember, Frequency } from "../types";

export const FREQUENCIES: Frequency[] = ["Daily", "Weekly", "Monthly"];

export type ChoreFormValues = {
  name: string;
  description: string;
  frequency: Frequency;
  memberIds: string[];
};

type Props = {
  visible: boolean;
  // Present means edit, absent means add — the only difference between the
  // two modes, so both share this one form.
  chore: Chore | null;
  members: FlatMember[];
  onClose: () => void;
  onSubmit: (values: ChoreFormValues) => Promise<void>;
};

// The chore add/edit form, lifted out of the Settings screen so the tab bar's
// "+" can open it from the Chores tab. Same fields and behaviour as before,
// minus the scroll-into-view machinery an inline form needed.
export default function ChoreFormModal({ visible, chore, members, onClose, onSubmit }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("Weekly");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Reset on open rather than on close, so the fields are already correct for
  // whichever chore (or none) the modal was opened for.
  useEffect(() => {
    if (!visible) return;
    setName(chore?.name ?? "");
    setDescription(chore?.description ?? "");
    setFrequency(chore?.frequency ?? "Weekly");
    setMemberIds(chore?.memberIds ?? []);
  }, [visible, chore]);

  const toggleMember = (userId: string) => {
    setMemberIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: trimmed, description: description.trim(), frequency, memberIds });
      onClose();
    } catch (err) {
      console.warn("Failed to save chore", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{chore ? "Edit chore" : "New chore"}</Text>

            <Text style={styles.formFieldLabel}>Chore name</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.inputText}
                placeholder="e.g. Vacuum living room"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
                autoFocus={!chore}
              />
            </View>

            <Text style={styles.formFieldLabel}>Frequency</Text>
            <View style={styles.freqSelector}>
              {FREQUENCIES.map((freq) => (
                <Pressable
                  key={freq}
                  style={[styles.freqBtn, frequency === freq && styles.freqBtnActive]}
                  onPress={() => setFrequency(freq)}
                >
                  <Text style={[styles.freqBtnText, frequency === freq && styles.freqBtnTextActive]}>{freq}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.formFieldLabel}>Rotation members</Text>
            <View style={styles.choreFormChips}>
              {members.map((m) => {
                const active = memberIds.includes(m.userId);
                return (
                  <Pressable
                    key={m.userId}
                    style={[
                      styles.choreFormChip,
                      active && { backgroundColor: m.color ?? colors.accent, borderColor: "transparent" },
                    ]}
                    onPress={() => toggleMember(m.userId)}
                  >
                    <Text style={[styles.choreFormChipText, active && styles.choreFormChipTextActive]}>
                      {m.displayName}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                style={[styles.choreFormChip, memberIds.length === 0 && styles.choreFormChipAllActive]}
                onPress={() => setMemberIds([])}
              >
                <Text style={styles.choreFormChipText}>All</Text>
              </Pressable>
            </View>

            <Text style={styles.formFieldLabel}>Description</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.inputText, styles.descriptionInput]}
                placeholder="What needs to be done? (optional)"
                placeholderTextColor={colors.textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
              />
            </View>

            <Pressable
              style={[styles.primaryButton, (!name.trim() || submitting) && styles.primaryButtonDisabled]}
              onPress={handleSubmit}
              disabled={!name.trim() || submitting}
            >
              <Text style={styles.primaryButtonText}>{chore ? "Save changes" : "Add chore"}</Text>
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
    formFieldLabel: {
      fontFamily: fonts.bold,
      fontSize: typeScale.caption,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      color: colors.textMuted,
      marginTop: 14,
      marginBottom: 6,
    },
    inputRow: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    inputText: { fontFamily: fonts.bold, color: colors.text, fontSize: typeScale.body, paddingVertical: 8 },
    descriptionInput: { minHeight: 60, textAlignVertical: "top" },
    freqSelector: { flexDirection: "row", gap: 6 },
    freqBtn: {
      flex: 1,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 8,
      alignItems: "center",
    },
    freqBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    freqBtnText: {
      fontFamily: fonts.bold,
      fontSize: typeScale.caption,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: colors.textMuted,
    },
    freqBtnTextActive: { color: colors.accentText },
    choreFormChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    choreFormChip: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    choreFormChipText: {
      fontFamily: fonts.bold,
      fontSize: typeScale.caption,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: colors.textMuted,
    },
    choreFormChipTextActive: { color: "rgba(0,0,0,0.75)" },
    choreFormChipAllActive: { backgroundColor: colors.border, borderColor: colors.inputBorder },
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
