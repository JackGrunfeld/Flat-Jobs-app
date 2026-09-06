import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import ModalSheet, { createFormStyles } from "./ModalSheet";
import { useTheme } from "../context/ThemeContext";
import type { ShoppingListItem } from "../types";

type Props = {
  visible: boolean;
  /** null = adding a new item; an item = renaming that one. */
  item?: ShoppingListItem | null;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
};

// Opened by the orange "+" FAB on the shopping list to add an item, and by
// the swipe-revealed Edit button on a card to rename one — the two are the
// same single-field form, so it serves both rather than duplicating it.
export default function AddShoppingItemModal({ visible, item, onClose, onSubmit }: Props) {
  const { colors } = useTheme();
  const form = useMemo(() => createFormStyles(colors), [colors]);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const editing = !!item;

  useEffect(() => {
    if (visible) setName(item?.name ?? "");
  }, [visible, item]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      console.warn("Failed to save shopping list item", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSheet
      visible={visible}
      title={editing ? "Edit item" : "Add item"}
      onClose={onClose}
      footer={
        <Pressable
          style={[form.primaryButton, (!name.trim() || submitting) && form.primaryButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !name.trim()}
        >
          <Text style={form.primaryButtonText}>{editing ? "Save changes" : "Add item"}</Text>
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
