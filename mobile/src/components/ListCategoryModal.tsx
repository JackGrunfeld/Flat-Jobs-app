import React, { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, StyleSheet, Alert } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
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
  const styles = useMemo(() => createStyles(colors), [colors]);
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{editing ? "Edit list" : "New list"}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Drinks"
            placeholderTextColor={colors.textMuted}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          {editing && canDelete && (
            <Pressable style={styles.deleteRow} onPress={handleDelete}>
              <Text style={styles.deleteText}>Delete list</Text>
            </Pressable>
          )}
          {editing && !canDelete && (
            <Text style={styles.hint}>This is your only list, so it can't be deleted.</Text>
          )}

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, !name.trim() && styles.confirmButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting || !name.trim()}
            >
              <Text style={styles.confirmText}>{editing ? "Save" : "Add"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 },
    card: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, gap: 8 },
    title: { fontFamily: fonts.bold, fontSize: typeScale.subheading, marginBottom: 8, color: colors.text },
    input: {
      fontFamily: fonts.regular,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 8,
      padding: 10,
      fontSize: typeScale.body,
      color: colors.text,
    },
    deleteRow: { marginTop: 12, paddingVertical: 8 },
    deleteText: { fontFamily: fonts.bold, fontSize: typeScale.body, color: colors.danger },
    hint: {
      marginTop: 12,
      fontFamily: fonts.regular,
      fontSize: typeScale.body,
      color: colors.textMuted,
      fontStyle: "italic",
    },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 16 },
    cancelButton: { paddingVertical: 10, paddingHorizontal: 16 },
    cancelText: { fontFamily: fonts.bold, color: colors.textMuted },
    confirmButton: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
    confirmButtonDisabled: { opacity: 0.5 },
    confirmText: { fontFamily: fonts.bold, color: colors.accentText },
  });
}
