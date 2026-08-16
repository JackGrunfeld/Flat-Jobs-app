import React, { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";

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
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [amountText, setAmountText] = useState((suggestedAmountCents / 100).toFixed(2));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) setAmountText((suggestedAmountCents / 100).toFixed(2));
  }, [visible, suggestedAmountCents]);

  const handleSubmit = async () => {
    const amountCents = Math.round(parseFloat(amountText || "0") * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return;
    setSubmitting(true);
    try {
      await onSubmit(amountCents, note.trim());
      setNote("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Settle up with {counterpartName}</Text>
          <Text style={styles.label}>Amount</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={amountText}
            onChangeText={setAmountText}
          />
          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="e.g. bank transfer"
            placeholderTextColor={colors.textMuted}
          />
          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.confirmButton} onPress={handleSubmit} disabled={submitting}>
              <Text style={styles.confirmText}>Mark as paid</Text>
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
    label: { fontFamily: fonts.regular, fontSize: typeScale.body, color: colors.textMuted, marginTop: 8 },
    input: { fontFamily: fonts.regular, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 8, padding: 10, fontSize: typeScale.body, color: colors.text },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 16 },
    cancelButton: { paddingVertical: 10, paddingHorizontal: 16 },
    cancelText: { fontFamily: fonts.bold, color: colors.textMuted },
    confirmButton: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
    confirmText: { fontFamily: fonts.bold, color: colors.accentText },
  });
}
