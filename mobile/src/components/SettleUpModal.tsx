import React, { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from "react-native";

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
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="e.g. bank transfer" />
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, gap: 8 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  label: { fontSize: 13, color: "#6B7280", marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 8, padding: 10, fontSize: 16 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 16 },
  cancelButton: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { color: "#6B7280", fontWeight: "600" },
  confirmButton: { backgroundColor: "#4F46E5", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  confirmText: { color: "#fff", fontWeight: "600" },
});
