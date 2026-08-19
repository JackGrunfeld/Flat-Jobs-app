import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import ModalSheet, { createFormStyles } from "./ModalSheet";
import { useTheme } from "../context/ThemeContext";

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
  const form = useMemo(() => createFormStyles(colors), [colors]);
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
    <ModalSheet
      visible={visible}
      title="Add item"
      onClose={onClose}
      footer={
        <Pressable
          style={[form.primaryButton, (!name.trim() || submitting) && form.primaryButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !name.trim()}
        >
          <Text style={form.primaryButtonText}>Add item</Text>
        </Pressable>
      }
    >
      <View>
        <Text style={form.fieldLabel}>What are we getting?</Text>
        <TextInput
          ref={inputRef}
          style={form.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Milk"
          placeholderTextColor={colors.textMuted}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />
      </View>
    </ModalSheet>
  );
}
