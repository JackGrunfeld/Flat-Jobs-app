import React, { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import * as flatService from "../services/flatService";
import * as choresService from "../services/choresService";
import { ApiError } from "../services/apiClient";
import type { Chore, Frequency } from "../types";

const FREQUENCIES: Frequency[] = ["Daily", "Weekly", "Monthly"];

// Port of HousePage.jsx: flat name edit, member list, email invites, and
// chore CRUD with a per-chore member-rotation picker.
export default function HouseScreen() {
  const { userFlat, refreshFlat } = useAuth();
  const [chores, setChores] = useState<Chore[]>([]);
  const [flatName, setFlatName] = useState(userFlat?.name ?? "");
  const [inviteEmail, setInviteEmail] = useState("");

  const [newChoreName, setNewChoreName] = useState("");
  const [newChoreFrequency, setNewChoreFrequency] = useState<Frequency>("Weekly");
  const [newChoreMembers, setNewChoreMembers] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!userFlat) return;
    const { chores } = await choresService.fetchChores(userFlat.id);
    setChores(chores);
  }, [userFlat]);

  useFocusEffect(
    useCallback(() => {
      load();
      setFlatName(userFlat?.name ?? "");
    }, [load, userFlat?.name]),
  );

  if (!userFlat) return null;

  const saveFlatName = async () => {
    if (!flatName.trim() || flatName === userFlat.name) return;
    await flatService.updateFlatName(userFlat.id, flatName.trim());
    await refreshFlat();
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      await flatService.inviteByEmail(userFlat.id, inviteEmail.trim());
      setInviteEmail("");
      await refreshFlat();
      Alert.alert("Invite sent", `${inviteEmail.trim()} can now join with your flat code.`);
    } catch (err) {
      Alert.alert("Couldn't send invite", err instanceof ApiError ? err.message : "Try again.");
    }
  };

  const toggleNewChoreMember = (userId: string) => {
    setNewChoreMembers((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const addChore = async () => {
    if (!newChoreName.trim()) return;
    await choresService.addChore(userFlat.id, {
      name: newChoreName.trim(),
      frequency: newChoreFrequency,
      memberIds: newChoreMembers,
    });
    setNewChoreName("");
    setNewChoreMembers([]);
    await load();
  };

  const deleteChore = async (choreId: string) => {
    await choresService.deleteChore(userFlat.id, choreId);
    await load();
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>Flat name</Text>
      <View style={styles.row}>
        <TextInput style={[styles.input, styles.flex1]} value={flatName} onChangeText={setFlatName} />
        <Pressable style={styles.smallButton} onPress={saveFlatName}>
          <Text style={styles.smallButtonText}>Save</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Members</Text>
      <View style={styles.codeBox}>
        <Text style={styles.codeLabel}>Flat code</Text>
        <Text style={styles.code}>{userFlat.code}</Text>
      </View>
      {userFlat.members.map((m) => (
        <Text key={m.userId} style={styles.memberRow}>
          • {m.displayName}
        </Text>
      ))}
      {userFlat.invitedEmails.map((email) => (
        <Text key={email} style={styles.invitedRow}>
          ✉ {email} (pending)
        </Text>
      ))}
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flex1]}
          placeholder="Invite by email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={inviteEmail}
          onChangeText={setInviteEmail}
        />
        <Pressable style={styles.smallButton} onPress={sendInvite}>
          <Text style={styles.smallButtonText}>Invite</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Chores</Text>
      {chores.map((chore) => (
        <View key={chore.id} style={styles.choreCard}>
          <View style={styles.flex1}>
            <Text style={styles.choreName}>{chore.name}</Text>
            <Text style={styles.choreMeta}>{chore.frequency}</Text>
          </View>
          <Pressable onPress={() => deleteChore(chore.id)}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Add a chore</Text>
      <TextInput
        style={styles.input}
        placeholder="Chore name"
        value={newChoreName}
        onChangeText={setNewChoreName}
      />
      <View style={styles.row}>
        {FREQUENCIES.map((freq) => (
          <Pressable
            key={freq}
            style={[styles.freqChip, newChoreFrequency === freq && styles.freqChipActive]}
            onPress={() => setNewChoreFrequency(freq)}
          >
            <Text style={[styles.freqChipText, newChoreFrequency === freq && styles.freqChipTextActive]}>
              {freq}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.subLabel}>Rotates between (leave empty for whole flat):</Text>
      <View style={styles.row}>
        {userFlat.members.map((m) => (
          <Pressable
            key={m.userId}
            style={[styles.freqChip, newChoreMembers.includes(m.userId) && styles.freqChipActive]}
            onPress={() => toggleNewChoreMember(m.userId)}
          >
            <Text
              style={[styles.freqChipText, newChoreMembers.includes(m.userId) && styles.freqChipTextActive]}
            >
              {m.displayName}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.primaryButton} onPress={addChore}>
        <Text style={styles.primaryButtonText}>Add chore</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#6B7280", marginTop: 20, marginBottom: 8, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  flex1: { flex: 1 },
  input: { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 8, padding: 10, fontSize: 15 },
  smallButton: { backgroundColor: "#4F46E5", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 },
  smallButtonText: { color: "#fff", fontWeight: "600" },
  codeBox: { backgroundColor: "#EEF2FF", borderRadius: 10, padding: 12, marginBottom: 8 },
  codeLabel: { fontSize: 12, color: "#6B7280" },
  code: { fontSize: 20, fontWeight: "700", letterSpacing: 3, color: "#4F46E5" },
  memberRow: { fontSize: 15, paddingVertical: 3 },
  invitedRow: { fontSize: 15, paddingVertical: 3, color: "#9CA3AF" },
  choreCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 10, padding: 12, marginBottom: 8 },
  choreName: { fontSize: 15, fontWeight: "600" },
  choreMeta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  deleteText: { color: "#DC2626", fontWeight: "600" },
  freqChip: { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  freqChipActive: { backgroundColor: "#4F46E5", borderColor: "#4F46E5" },
  freqChipText: { fontSize: 13 },
  freqChipTextActive: { color: "#fff" },
  subLabel: { fontSize: 13, color: "#6B7280", marginTop: 12, marginBottom: 6 },
  primaryButton: { backgroundColor: "#4F46E5", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16, marginBottom: 32 },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
