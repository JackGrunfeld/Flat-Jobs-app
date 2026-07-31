import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, Switch, ScrollView, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import * as flatService from "../services/flatService";
import { requestCompletionAlertPermission } from "../notifications/completionAlerts";
import { getCompletionAlertsEnabled, setCompletionAlertsEnabled } from "../storage/preferences";

const COLORS = ["#EF4444", "#F97316", "#EAB308", "#22C55E", "#0EA5E9", "#6366F1", "#A855F7", "#EC4899"];

// Port of SettingsPage.jsx: profile colour picker, notification-permission
// toggle, sign out, leave-flat (with a confirm step).
export default function SettingsScreen() {
  const { currentUser, userFlat, logout, leaveFlat, refreshFlat } = useAuth();
  const [alertsEnabled, setAlertsEnabled] = useState(true);

  useFocusEffect(
    useCallback(() => {
      getCompletionAlertsEnabled().then(setAlertsEnabled);
    }, []),
  );

  if (!currentUser || !userFlat) return null;

  const myColor = userFlat.members.find((m) => m.userId === currentUser.id)?.color ?? null;

  const pickColor = async (color: string) => {
    await flatService.updateMemberColor(userFlat.id, color);
    await refreshFlat();
  };

  const onToggleAlerts = async (value: boolean) => {
    if (value) {
      const granted = await requestCompletionAlertPermission();
      if (!granted) {
        Alert.alert("Permission needed", "Enable notifications in system settings to turn this on.");
        return;
      }
    }
    setAlertsEnabled(value);
    await setCompletionAlertsEnabled(value);
  };

  const confirmLeaveFlat = () => {
    Alert.alert(
      "Leave flat?",
      "You'll need a new invite or flat code to rejoin.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: () => leaveFlat() },
      ],
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>Account</Text>
      <Text style={styles.name}>{currentUser.displayName}</Text>
      <Text style={styles.email}>{currentUser.email}</Text>

      <Text style={styles.sectionTitle}>Your colour</Text>
      <View style={styles.colorRow}>
        {COLORS.map((color) => (
          <Pressable
            key={color}
            style={[styles.colorSwatch, { backgroundColor: color }, myColor === color && styles.colorSwatchActive]}
            onPress={() => pickColor(color)}
          />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>Completion alerts</Text>
        <Switch value={alertsEnabled} onValueChange={onToggleAlerts} />
      </View>

      <Pressable style={styles.dangerButton} onPress={confirmLeaveFlat}>
        <Text style={styles.dangerButtonText}>Leave flat</Text>
      </Pressable>

      <Pressable style={styles.signOutButton} onPress={() => logout()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#6B7280", marginTop: 20, marginBottom: 8, textTransform: "uppercase" },
  name: { fontSize: 18, fontWeight: "700" },
  email: { fontSize: 14, color: "#6B7280", marginTop: 2 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  colorSwatch: { width: 36, height: 36, borderRadius: 18 },
  colorSwatchActive: { borderWidth: 3, borderColor: "#111827" },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  settingLabel: { fontSize: 15 },
  dangerButton: { borderWidth: 1, borderColor: "#DC2626", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 32 },
  dangerButtonText: { color: "#DC2626", fontWeight: "600" },
  signOutButton: { padding: 14, alignItems: "center", marginTop: 12, marginBottom: 32 },
  signOutText: { color: "#6B7280", fontWeight: "600" },
});
