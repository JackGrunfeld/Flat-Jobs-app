import React, { useEffect, useMemo, useState } from "react";
import { Text, TextInput, Pressable } from "react-native";
import ModalSheet, { createFormStyles } from "./ModalSheet";
import { useTheme } from "../context/ThemeContext";

type Props = {
  visible: boolean;
  counterpartName: string;
  suggestedAmountCents: number;
  onClose: () => void;
  onSubmit: (amountCents: number, note: string) => Promise<void>;
};

// "Mark as paid" flow: pick amount (prefilled from the computed balance),
// optional note, submit -> POST /flats/:flatId/settlements, which triggers a
// real push notification to the counterpart server-side.
export default function SettleUpModal({ visible, counterpartName, suggestedAmountCents, onClose, onSubmit }: Props) {
  const { colors } = useTheme();
  const form = useMemo(() => createFormStyles(colors), [colors]);
  const [amountText, setAmountText] = useState((suggestedAmountCents / 100).toFixed(2));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) setAmountText((suggestedAmountCents / 100).toFixed(2));
  }, [visible, suggestedAmountCents]);

  const amountCents = Math.round(parseFloat(amountText || "0") * 100);
  const valid = Number.isFinite(amountCents) && amountCents > 0;

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(amountCents, note.trim());
      setNote("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSheet
      visible={visible}
      title={`Settle up with ${counterpartName}`}
      onClose={onClose}
      footer={
        <Pressable
          style={[form.primaryButton, (!valid || submitting) && form.primaryButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting || !valid}
        >
          <Text style={form.primaryButtonText}>Mark as paid</Text>
        </Pressable>
      }
    >
      <Text style={form.fieldLabel}>Amount</Text>
      <TextInput
        style={form.input}
        keyboardType="decimal-pad"
        value={amountText}
        onChangeText={setAmountText}
        placeholder="0.00"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={form.fieldLabel}>Note (optional)</Text>
      <TextInput
        style={form.input}
        value={note}
        onChangeText={setNote}
        placeholder="e.g. bank transfer"
        placeholderTextColor={colors.textMuted}
      />
    </ModalSheet>
  );
}
