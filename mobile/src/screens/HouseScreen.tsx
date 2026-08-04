import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import * as choresService from "../services/choresService";
import * as completionsService from "../services/completionsService";
import { fireCompletionAlert } from "../notifications/completionAlerts";
import { getCurrentWeek, getWeekDates, getPeriodIndex } from "../utils/rosterHelpers";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import SettingsButton from "../components/SettingsButton";
import type { Chore, Completion, FlatMember } from "../types";

type Assignment = {
  chore: Chore;
  assignedUserId: string | null;
  done: boolean;
};

// The card face sits on a flatmate's own colour, so its palette is fixed
// rather than themed — black-on-colour reads correctly in light and dark
// alike, the same reason member colours themselves never invert.
const ON_CARD_INK = "#272525";
const ON_CARD_NAME = "#000000";

// First name only — the card name is set large and chunky, so a full name
// would wrap. Falls back to "First L." when two flatmates share a first name.
function buildDisplayNames(members: FlatMember[]): Record<string, string> {
  const firsts = members.map((m) => (m.displayName || "").trim().split(/\s+/)[0] || m.displayName);
  const out: Record<string, string> = {};
  members.forEach((m) => {
    const parts = (m.displayName || "").trim().split(/\s+/);
    const first = parts[0] || m.displayName;
    const duplicated = firsts.filter((n) => n === first).length > 1;
    out[m.userId] = duplicated && parts.length > 1 ? `${first} ${parts[1][0].toUpperCase()}.` : first;
  });
  return out;
}

// Week navigator + one block-coloured card per flatmate, tapped to drop down
// the individual chores behind it. Flat config (name/code, flatmates,
// invites, chore list editor) lives on the Settings tab.
export default function HouseScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentUser, userFlat } = useAuth();
  const [chores, setChores] = useState<Chore[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [week, setWeek] = useState(getCurrentWeek());
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userFlat) return;
    const [{ chores }, completionsRes] = await Promise.all([
      choresService.fetchChores(userFlat.id),
      completionsService.fetchCompletions(userFlat.id),
    ]);
    setChores(chores);
    setCompletions(completionsRes.completions);
  }, [userFlat]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const assignmentsForWeek = useMemo<Assignment[]>(() => {
    if (!userFlat) return [];
    const flatMemberIds = userFlat.members.map((m) => m.userId);
    const completionByChoreWeek = new Map(completions.map((c) => [`${c.choreId}:${c.week}`, c]));

    return chores.map((chore) => {
      const pool = chore.memberIds.length > 0 ? chore.memberIds : flatMemberIds;
      const periodIndex = getPeriodIndex(chore.frequency, week);
      const assignedUserId = pool.length > 0 ? pool[periodIndex % pool.length] : null;
      return {
        chore,
        assignedUserId,
        done: completionByChoreWeek.get(`${chore.id}:${week}`)?.done ?? false,
      };
    });
  }, [chores, completions, userFlat, week]);

  // Every flatmate gets a card, including those with nothing on this week —
  // they read as "Off Duty" rather than silently vanishing from the roster.
  const rosterCards = useMemo(() => {
    if (!userFlat) return [];
    const byMember = new Map<string, Assignment[]>(userFlat.members.map((m) => [m.userId, []]));
    for (const a of assignmentsForWeek) {
      if (a.assignedUserId && byMember.has(a.assignedUserId)) {
        byMember.get(a.assignedUserId)!.push(a);
      }
    }
    const displayNames = buildDisplayNames(userFlat.members);
    return userFlat.members.map((member) => {
      const items = byMember.get(member.userId) ?? [];
      // Monthly chores rotate on their own cadence, so they're kept out of
      // the headline label and the roll-up tick — they get their own section.
      const main = items.filter((i) => i.chore.frequency !== "Monthly");
      const monthly = items.filter((i) => i.chore.frequency === "Monthly");
      return {
        member,
        displayName: displayNames[member.userId] ?? member.displayName,
        items,
        main,
        monthly,
        allMainDone: main.length > 0 && main.every((i) => i.done),
      };
    });
  }, [assignmentsForWeek, userFlat]);

  const doneCount = assignmentsForWeek.filter((a) => a.done).length;

  const setDone = async (items: Assignment[], nextDone: boolean) => {
    if (!userFlat) return;
    const targets = items.filter((i) => i.assignedUserId);
    if (targets.length === 0) return;

    setCompletions((prev) => {
      const touched = new Set(targets.map((t) => t.chore.id));
      const others = prev.filter((c) => !(touched.has(c.choreId) && c.week === week));
      return [
        ...others,
        ...targets.map((t) => ({ choreId: t.chore.id, week, assignedUserId: t.assignedUserId!, done: nextDone })),
      ];
    });

    await Promise.all(
      targets.map((t) =>
        completionsService.saveCompletion(userFlat.id, {
          choreId: t.chore.id,
          week,
          assignedUserId: t.assignedUserId!,
          done: nextDone,
        }),
      ),
    );

    if (nextDone && targets[0].assignedUserId === currentUser?.id) {
      fireCompletionAlert(targets.map((t) => t.chore.name).join(", ")).catch(() => {});
    }
  };

  if (!userFlat) return null;

  return (
    <View style={styles.root}>
      <ScrollView style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.pageTitle}>Chores</Text>

        <View style={styles.weekNav}>
          <Pressable onPress={() => setWeek((w) => w - 1)} hitSlop={8}>
            <Text style={styles.weekNavArrow}>‹</Text>
          </Pressable>
          <Text style={styles.weekLabel}>{getWeekDates(week)}</Text>
          <Pressable onPress={() => setWeek((w) => w + 1)} hitSlop={8}>
            <Text style={styles.weekNavArrow}>›</Text>
          </Pressable>
        </View>

        <Text style={styles.stats}>
          {doneCount}/{assignmentsForWeek.length} done this week
        </Text>

        {rosterCards.map((card) => {
          const offDuty = card.items.length === 0;
          const expanded = expandedUserId === card.member.userId;
          const label = card.main.length === 0 ? "Off Duty" : card.main.map((i) => i.chore.name).join(" + ");
          // A single weekly chore says everything on the front of the card, so
          // the drop-down shows its description instead of repeating the name.
          const showLoneDescription = card.main.length === 1 && card.monthly.length === 0;

          return (
            <Pressable
              key={card.member.userId}
              style={({ pressed }) => [
                styles.choreCard,
                { backgroundColor: card.member.color ?? colors.accent },
                pressed && !offDuty && styles.choreCardPressed,
              ]}
              onPress={() => !offDuty && setExpandedUserId(expanded ? null : card.member.userId)}
              disabled={offDuty}
            >
              <View style={styles.cardHeaderRow}>
                <View style={styles.choreInfo}>
                  <Text style={styles.choreName} numberOfLines={1}>
                    {card.displayName}
                  </Text>
                  <View style={styles.choreTaskRow}>
                    <Text style={styles.choreTask} numberOfLines={2}>
                      {label}
                    </Text>
                    {card.monthly.length > 0 && <Text style={styles.monthlyCardBadge}>M</Text>}
                  </View>
                </View>

                {card.main.length > 0 && (
                  <Pressable
                    onPress={() => setDone(card.main, !card.allMainDone)}
                    hitSlop={10}
                    style={[styles.checkbox, card.allMainDone && styles.checkboxDone]}
                  >
                    {card.allMainDone && <Text style={styles.checkmark}>✓</Text>}
                  </Pressable>
                )}
              </View>

              {expanded && (
                <View style={styles.details}>
                  {showLoneDescription && (
                    <Text style={styles.detailText}>
                      {card.main[0].chore.description?.trim() || "No description added."}
                    </Text>
                  )}

                  {!showLoneDescription &&
                    card.main.map((item, i) => (
                      <View
                        key={item.chore.id}
                        style={[styles.subTaskRow, i === card.main.length - 1 && card.monthly.length === 0 && styles.subTaskRowLast]}
                      >
                        <View style={styles.subTaskInfo}>
                          <Text style={styles.subTaskName}>{item.chore.name}</Text>
                          {!!item.chore.description?.trim() && (
                            <Text style={styles.subTaskDesc}>{item.chore.description}</Text>
                          )}
                        </View>
                        <Pressable
                          onPress={() => setDone([item], !item.done)}
                          hitSlop={10}
                          style={[styles.checkbox, item.done && styles.checkboxDone]}
                        >
                          {item.done && <Text style={styles.checkmark}>✓</Text>}
                        </Pressable>
                      </View>
                    ))}

                  {card.monthly.map((item, i) => (
                    <View
                      key={item.chore.id}
                      style={[styles.subTaskRow, i === card.monthly.length - 1 && styles.subTaskRowLast]}
                    >
                      <View style={styles.subTaskInfo}>
                        <Text style={styles.monthlyBadge}>Monthly</Text>
                        <Text style={styles.subTaskName}>{item.chore.name}</Text>
                        {!!item.chore.description?.trim() && (
                          <Text style={styles.subTaskDesc}>{item.chore.description}</Text>
                        )}
                      </View>
                      <Pressable
                        onPress={() => setDone([item], !item.done)}
                        hitSlop={10}
                        style={[styles.checkbox, item.done && styles.checkboxDone]}
                      >
                        {item.done && <Text style={styles.checkmark}>✓</Text>}
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </Pressable>
          );
        })}

        {chores.length === 0 && <Text style={styles.empty}>No chores yet — add some from Settings.</Text>}
      </ScrollView>
      <SettingsButton />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    container: { flex: 1, padding: 16, backgroundColor: colors.bg },
    pageTitle: {
      fontFamily: fonts.bold,
      fontSize: typeScale.caption,
      letterSpacing: 3,
      textTransform: "uppercase",
      color: colors.accent,
      textAlign: "center",
      marginBottom: 16,
    },
    weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 8 },
    weekNavArrow: { fontFamily: fonts.regular, fontSize: typeScale.subheading, color: colors.accent, paddingHorizontal: 12 },
    weekLabel: { fontFamily: fonts.bold, fontSize: typeScale.body, letterSpacing: 1, textTransform: "uppercase", color: colors.text },
    stats: {
      fontFamily: fonts.bold,
      textAlign: "center",
      fontSize: typeScale.caption,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.textMuted,
      marginBottom: 16,
    },

    // ── The block-coloured roster card ──
    choreCard: { borderRadius: 12, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 10 },
    choreCardPressed: { transform: [{ scale: 0.98 }] },
    cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    choreInfo: { flex: 1 },
    choreName: {
      fontFamily: fonts.display,
      fontSize: 26,
      color: ON_CARD_NAME,
      textTransform: "uppercase",
      letterSpacing: -1,
    },
    choreTaskRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 2 },
    choreTask: {
      flexShrink: 1,
      fontFamily: fonts.bold,
      fontSize: 15,
      color: ON_CARD_INK,
      letterSpacing: -0.5,
      opacity: 0.85,
    },
    monthlyCardBadge: {
      fontFamily: fonts.bold,
      fontSize: 9,
      textTransform: "uppercase",
      letterSpacing: 1,
      color: "rgba(0,0,0,0.55)",
      backgroundColor: "rgba(0,0,0,0.12)",
      borderRadius: 4,
      paddingVertical: 1,
      paddingHorizontal: 5,
      overflow: "hidden",
    },

    // Filled with the same near-black as the border rather than the brand
    // accent: the card behind it is an arbitrary flatmate colour, and a dark
    // fill is the only one guaranteed to read as "ticked" against all of them.
    checkbox: {
      width: 24,
      height: 24,
      borderWidth: 3,
      borderColor: ON_CARD_INK,
      borderRadius: 6,
      backgroundColor: "transparent",
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxDone: { backgroundColor: ON_CARD_INK, borderColor: ON_CARD_INK },
    checkmark: { fontFamily: fonts.bold, color: "#fff", fontSize: 13, lineHeight: 16 },

    // ── Drop-down detail ──
    details: { width: "100%", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.1)" },
    detailText: { fontFamily: fonts.regular, fontSize: 12, color: "rgba(0,0,0,0.7)", lineHeight: 17 },
    subTaskRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(0,0,0,0.08)",
    },
    subTaskRowLast: { borderBottomWidth: 0 },
    subTaskInfo: { flex: 1 },
    subTaskName: {
      fontFamily: fonts.bold,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: -0.3,
      color: "rgba(0,0,0,0.75)",
    },
    subTaskDesc: { fontFamily: fonts.regular, fontSize: 10, color: "rgba(0,0,0,0.5)", marginTop: 3, lineHeight: 14 },
    monthlyBadge: {
      alignSelf: "flex-start",
      fontFamily: fonts.bold,
      fontSize: 8,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      color: "#fff",
      backgroundColor: "rgba(0,0,0,0.45)",
      borderRadius: 4,
      paddingVertical: 2,
      paddingHorizontal: 6,
      marginBottom: 4,
      overflow: "hidden",
    },

    empty: { fontFamily: fonts.regular, textAlign: "center", color: colors.textMuted, marginBottom: 16 },
  });
}
