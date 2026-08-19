import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import ModalSheet, { createFormStyles } from "./ModalSheet";
import { useTheme } from "../context/ThemeContext";
import { inkFor } from "../theme/cardInk";
import type { ThemeColors } from "../theme/colors";
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
  const form = useMemo(() => createFormStyles(colors), [colors]);

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
    <ModalSheet
      visible={visible}
      title={chore ? "Edit chore" : "New chore"}
      onClose={onClose}
      footer={
        <Pressable
          style={[form.primaryButton, (!name.trim() || submitting) && form.primaryButtonDisabled]}
          onPress={handleSubmit}
          disabled={!name.trim() || submitting}
        >
          <Text style={form.primaryButtonText}>{chore ? "Save changes" : "Add chore"}</Text>
        </Pressable>
      }
    >
      <Text style={form.fieldLabel}>Chore name</Text>
      <TextInput
        style={form.input}
        placeholder="e.g. Vacuum living room"
        placeholderTextColor={colors.textMuted}
        value={name}
        onChangeText={setName}
        autoFocus={!chore}
      />

      <Text style={form.fieldLabel}>Frequency</Text>
      {/* A segmented control rather than free-flowing chips: three fixed
          options that read better sharing the width evenly. */}
      <View style={styles.freqSelector}>
        {FREQUENCIES.map((freq) => (
          <Pressable
            key={freq}
            style={[styles.freqBtn, frequency === freq && styles.freqBtnActive]}
            onPress={() => setFrequency(freq)}
          >
            <Text style={[form.chipText, frequency === freq && form.chipTextActive]}>{freq}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={form.fieldLabel}>Rotation members</Text>
      <View style={form.row}>
        {members.map((m) => {
          const active = memberIds.includes(m.userId);
          const fill = m.color ?? colors.accent;
          return (
            <Pressable
              key={m.userId}
              style={[form.chip, active && { backgroundColor: fill, borderColor: "transparent" }]}
              onPress={() => toggleMember(m.userId)}
            >
              <Text style={[form.chipText, active && { color: inkFor(fill).strong }]}>{m.displayName}</Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[form.chip, memberIds.length === 0 && styles.chipAllActive]}
          onPress={() => setMemberIds([])}
        >
          <Text style={form.chipText}>All</Text>
        </Pressable>
      </View>

      <Text style={form.fieldLabel}>Description</Text>
      <TextInput
        style={[form.input, form.multiline]}
        placeholder="What needs to be done? (optional)"
        placeholderTextColor={colors.textMuted}
        value={description}
        onChangeText={setDescription}
        multiline
      />
    </ModalSheet>
  );
}

// Only what the shared form vocabulary doesn't cover: the frequency control's
// equal-width segments, and the "All" chip's neutral selected state (it isn't
// a person, so it can't borrow a member colour).
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    freqSelector: { flexDirection: "row", gap: 6 },
    freqBtn: {
      flex: 1,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: "center",
    },
    freqBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipAllActive: { backgroundColor: colors.border, borderColor: colors.inputBorder },
  });
}
