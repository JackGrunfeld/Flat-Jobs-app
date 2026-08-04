import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdd: (name: string) => Promise<void>;
};

// Opened by the orange "+" FAB on the shopping list — a single-field modal
// rather than an inline row, since the list is now a stack of cards with no
// natural "next row" slot to type into.
export default function AddShoppingItemModal({ visible, onClose, onAdd }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) setName("");
  }, [visible]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onAdd(trimmed);
      onClose();
    } catch (err) {
      console.warn("Failed to add shopping list item", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Add item</Text>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Milk"
            placeholderTextColor={colors.textMuted}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, !name.trim() && styles.confirmButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting || !name.trim()}
            >
              <Text style={styles.confirmText}>Add</Text>
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
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 16 },
    cancelButton: { paddingVertical: 10, paddingHorizontal: 16 },
    cancelText: { fontFamily: fonts.bold, color: colors.textMuted },
    confirmButton: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
    confirmButtonDisabled: { opacity: 0.5 },
    confirmText: { fontFamily: fonts.bold, color: colors.accentText },
  });
}
