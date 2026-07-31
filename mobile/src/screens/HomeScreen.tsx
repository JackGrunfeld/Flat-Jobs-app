import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import * as choresService from "../services/choresService";
import * as completionsService from "../services/completionsService";
import { fireCompletionAlert } from "../notifications/completionAlerts";
import { getCurrentWeek, getWeekDates, getPeriodIndex } from "../utils/rosterHelpers";
import type { Chore, Completion } from "../types";

// Port of HomePage.jsx: week navigator + per-person chore cards. Each
// chore's assignee for a given week rotates through its member pool
// (chore.memberIds, or the whole flat if empty) by frequency-aware period
// index — same rotation math as the web version (rosterHelpers.ts).
export default function HomeScreen() {
  const { currentUser, userFlat } = useAuth();
  const [week, setWeek] = useState(getCurrentWeek());
  const [chores, setChores] = useState<Chore[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userFlat) return;
    const [choresRes, completionsRes] = await Promise.all([
      choresService.fetchChores(userFlat.id),
      completionsService.fetchCompletions(userFlat.id),
    ]);
    setChores(choresRes.chores);
    setCompletions(completionsRes.completions);
    setLoading(false);
  }, [userFlat]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const assignmentsForWeek = useMemo(() => {
    if (!userFlat) return [];
    const flatMemberIds = userFlat.members.map((m) => m.userId);
    const memberById = new Map(userFlat.members.map((m) => [m.userId, m]));
    const completionByChoreWeek = new Map(completions.map((c) => [`${c.choreId}:${c.week}`, c]));

    return chores.map((chore) => {
      const pool = chore.memberIds.length > 0 ? chore.memberIds : flatMemberIds;
      const periodIndex = getPeriodIndex(chore.frequency, week);
      const assignedUserId = pool.length > 0 ? pool[periodIndex % pool.length] : null;
      const completion = completionByChoreWeek.get(`${chore.id}:${week}`);
      return {
        chore,
        assignedUserId,
        assignedName: assignedUserId ? memberById.get(assignedUserId)?.displayName ?? "Unknown" : "Unassigned",
        done: completion?.done ?? false,
      };
    });
  }, [chores, completions, userFlat, week]);

  const grouped = useMemo(() => {
    const byPerson = new Map<string, typeof assignmentsForWeek>();
    for (const a of assignmentsForWeek) {
      const key = a.assignedUserId ?? "unassigned";
      byPerson.set(key, [...(byPerson.get(key) ?? []), a]);
    }
    return byPerson;
  }, [assignmentsForWeek]);

  const doneCount = assignmentsForWeek.filter((a) => a.done).length;

  const toggle = async (item: (typeof assignmentsForWeek)[number]) => {
    if (!userFlat || !item.assignedUserId) return;
    const nextDone = !item.done;
    setCompletions((prev) => {
      const others = prev.filter((c) => !(c.choreId === item.chore.id && c.week === week));
      return [...others, { choreId: item.chore.id, week, assignedUserId: item.assignedUserId!, done: nextDone }];
    });
    await completionsService.saveCompletion(userFlat.id, {
      choreId: item.chore.id,
      week,
      assignedUserId: item.assignedUserId,
      done: nextDone,
    });
    if (nextDone && item.assignedUserId === currentUser?.id) {
      fireCompletionAlert(item.chore.name).catch(() => {});
    }
  };

  if (loading) return null;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
    >
      <View style={styles.weekNav}>
        <Pressable onPress={() => setWeek((w) => w - 1)}>
          <Text style={styles.weekNavArrow}>‹</Text>
        </Pressable>
        <Text style={styles.weekLabel}>{getWeekDates(week)}</Text>
        <Pressable onPress={() => setWeek((w) => w + 1)}>
          <Text style={styles.weekNavArrow}>›</Text>
        </Pressable>
      </View>

      <Text style={styles.stats}>
        {doneCount}/{assignmentsForWeek.length} done this week
      </Text>

      {Array.from(grouped.entries()).map(([userId, items]) => (
        <View key={userId} style={styles.personCard}>
          <Text style={styles.personName}>{items[0]?.assignedName}</Text>
          {items.map((item) => (
            <Pressable key={item.chore.id} style={styles.choreRow} onPress={() => toggle(item)}>
              <View style={[styles.checkbox, item.done && styles.checkboxDone]}>
                {item.done && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={[styles.choreName, item.done && styles.choreNameDone]}>{item.chore.name}</Text>
            </Pressable>
          ))}
        </View>
      ))}

      {chores.length === 0 && (
        <Text style={styles.empty}>No chores yet — add some from the House tab.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 8 },
  weekNavArrow: { fontSize: 28, color: "#4F46E5", paddingHorizontal: 12 },
  weekLabel: { fontSize: 16, fontWeight: "600" },
  stats: { textAlign: "center", color: "#6B7280", marginBottom: 16 },
  personCard: { backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, marginBottom: 12 },
  personName: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  choreRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: { backgroundColor: "#4F46E5", borderColor: "#4F46E5" },
  checkmark: { color: "#fff", fontSize: 14, fontWeight: "700" },
  choreName: { fontSize: 15 },
  choreNameDone: { textDecorationLine: "line-through", color: "#9CA3AF" },
  empty: { textAlign: "center", color: "#9CA3AF", marginTop: 40 },
});
