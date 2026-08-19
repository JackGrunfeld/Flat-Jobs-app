import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, Alert } from "react-native";
import ModalSheet, { createFormStyles } from "./ModalSheet";
import { useTheme } from "../context/ThemeContext";
import type { ShoppingList } from "../types";

type Props = {
  visible: boolean;
  /** null = creating a new list; a list = editing that one. */
  list: ShoppingList | null;
  /** False when this is the flat's only list — it can't be deleted. */
  canDelete: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
};

// Serves both the "+" (create) and the long-press edit menu (rename/delete)
// on the list-categories bar — the two are the same single-field form, so
// splitting them into separate modals would just duplicate it.
export default function ListCategoryModal({ visible, list, canDelete, onClose, onSubmit, onDelete }: Props) {
  const { colors } = useTheme();
  const form = useMemo(() => createFormStyles(colors), [colors]);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const editing = list !== null;

  useEffect(() => {
    if (visible) setName(list?.name ?? "");
  }, [visible, list]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      console.warn("Failed to save list", err);
      Alert.alert("Couldn't save list", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Deleting a list takes everything on it, which isn't recoverable — so
  // it's spelled out before anything happens.
  const handleDelete = () => {
    if (!list) return;
    Alert.alert(
      `Delete "${list.name}"?`,
      "Everything on this list will be deleted too. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await onDelete();
              onClose();
            } catch (err) {
              console.warn("Failed to delete list", err);
              Alert.alert("Couldn't delete list", err instanceof Error ? err.message : "Please try again.");
            }
          },
        },
      ],
    );
  };

  return (
    <ModalSheet
      visible={visible}
      title={editing ? "Edit list" : "New list"}
      onClose={onClose}
      footer={
        <Pressable
          style={[form.primaryButton, (!name.trim() || submitting) && form.primaryButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !name.trim()}
        >
          <Text style={form.primaryButtonText}>{editing ? "Save changes" : "Add list"}</Text>
        </Pressable>
      }
    >
      <View>
        <Text style={form.fieldLabel}>List name</Text>
        <TextInput
          style={form.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Drinks"
          placeholderTextColor={colors.textMuted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        {/* Destructive, so it stays in the body rather than joining the
            footer next to the button someone is actually aiming for. */}
        {editing && canDelete && (
          <>
            <Text style={form.fieldLabel}>Danger zone</Text>
            <Pressable style={form.dangerButton} onPress={handleDelete}>
              <Text style={form.dangerButtonText}>Delete list</Text>
            </Pressable>
          </>
        )}
        {editing && !canDelete && <Text style={form.hint}>This is your only list, so it can't be deleted.</Text>}
      </View>
    </ModalSheet>
  );
}
