import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import ModalSheet, { createFormStyles } from "./ModalSheet";
import MemberMultiSelect from "./MemberMultiSelect";
import SelectDropdown from "./SelectDropdown";
import { useTheme } from "../context/ThemeContext";
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

  // "All" is the resting state: an empty selection (or one covering every
  // member) means everyone. Tapping a member while in the "All" state switches
  // to just that person; selecting everyone again returns to "All".
  const toggleMember = (userId: string) => {
    setMemberIds((prev) => {
      const isAll = prev.length === 0 || prev.length === members.length;
      if (isAll) return [userId];
      const next = prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId];
      return next.length === members.length ? [] : next;
    });
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
      <SelectDropdown options={FREQUENCIES} value={frequency} onChange={setFrequency} placeholder="Select frequency" />

      <Text style={form.fieldLabel}>Rotation members</Text>
      <MemberMultiSelect members={members} selectedIds={memberIds} onToggle={toggleMember} />

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

