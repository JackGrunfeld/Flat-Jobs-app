import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBarSpace } from "../navigation/FlatTabBar";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import * as choresService from "../services/choresService";
import * as completionsService from "../services/completionsService";
import { assignChores, getDayIndex, getPeriodIndex } from "../utils/rosterHelpers";
import { buildDisplayNames } from "../utils/displayNames";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { inkFor } from "../theme/cardInk";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import RevealTile from "../components/RevealTile";
import SettingsButton, { HEADER_TITLE_TOP } from "../components/SettingsButton";
import ChoreFormModal, { FREQUENCIES, type ChoreFormValues } from "../components/ChoreFormModal";
import DayStrip from "../components/DayStrip";
import ProfileAvatar from "../components/ProfileAvatar";
import { useRegisterAddAction } from "../navigation/AddActionContext";
import { Ionicons } from "@expo/vector-icons";
import type { Chore, Completion } from "../types";

type Assignment = {
  chore: Chore;
  assignedUserId: string | null;
  done: boolean;
};

// Past this many chore chips the row stops naming them and trails off, rather
// than shrinking every chip until none of them is readable.
const MAX_TASK_CHIPS = 3;

// Inside the tick box's 3pt border: 24 − 6. The slices are cut from discs a
// little wider than the box's own half-diagonal (18/√2 ≈ 12.7) so a full sweep
// reaches into the corners instead of leaving a circle inscribed in a square.
const PIE_HALF = 9;
const PIE_RADIUS = 15;

// The card face sits on a flatmate's own colour, so its palette follows that
// colour rather than the theme — see theme/cardInk.
const CARD_HEADER_HEIGHT = 72;
// Avatar disc on the per-flatmate roster cards, sized to sit cleanly beside
// the 26pt name in the same 72pt header.
const CARD_AVATAR = 34;

// How far through a flatmate's jobs they are, drawn as a pizza: the fill
// sweeps clockwise from twelve o'clock, so one of four is a quarter slice.
//
// Two half-discs behind two half-width windows, because there's no arc to draw
// with — a half-disc rotated inside a window that only shows one side of the
// box exposes exactly the sector between them. The first window covers the
// first half of the sweep, the second takes over past 50%.
function PieFill({
  progress,
  color,
  styles,
}: {
  progress: number;
  color: string;
  styles: ReturnType<typeof createStyles>;
}) {
  const sweep = Math.max(0, Math.min(1, progress)) * 360;
  const rightRotation = useRef(new Animated.Value(Math.min(sweep, 180) - 180)).current;
  const leftRotation = useRef(new Animated.Value(sweep > 180 ? sweep - 360 : -180)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(rightRotation, {
        toValue: Math.min(sweep, 180) - 180,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(leftRotation, {
        toValue: sweep > 180 ? sweep - 360 : -180,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }, [leftRotation, rightRotation, sweep]);

  return (
    <View style={styles.pie} pointerEvents="none">
      <View style={styles.pieWindowRight}>
        <Animated.View
          style={[
            styles.pieSliceRight,
            { backgroundColor: color },
            {
              transform: [{ rotate: rightRotation.interpolate({ inputRange: [-180, 180], outputRange: ["-180deg", "180deg"] }) }],
            },
          ]}
        />
      </View>
      {sweep > 180 && (
        <View style={styles.pieWindowLeft}>
          <Animated.View
            style={[
              styles.pieSliceLeft,
              { backgroundColor: color },
              {
                transform: [{ rotate: leftRotation.interpolate({ inputRange: [-180, 180], outputRange: ["-180deg", "180deg"] }) }],
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

// Colour+initials disc. Falls back to the card's own foreground when a
// flatmate hasn't picked a colour yet, so it's never an invisible circle.
// Thin wrapper over the app-wide ProfileAvatar so this screen's call sites keep
// passing `fg` — the avatars here sit on block-coloured tiles, so a member
// without a colour of their own has to fall back to the tile's ink rather than
// the page's.
function Avatar({
  member,
  size,
  fg,
}: {
  member: { displayName: string; color: string | null; photo?: string | null };
  size: number;
  fg: string;
}) {
  return (
    <ProfileAvatar
      displayName={member.displayName}
      color={member.color}
      photo={member.photo ?? null}
      size={size}
      fallbackOn={fg}
    />
  );
}

// Week navigator + one block-coloured card per flatmate, tapped to drop down
// the individual chores behind it. Flat config (name/code, flatmates,
// invites, chore list editor) lives on the Settings tab.
// The reveal cadence Home and Bills already use: one step between blocks,
// and the stagger stops climbing after a few cards so a long roster doesn't
// leave the last one waiting seconds to appear.
const REVEAL_STEP = 60;
const MAX_STAGGER = 6;

export default function HouseScreen() {
  const insets = useSafeAreaInsets();
  // The tab bar floats over the page, so the last row needs
  // somewhere to scroll clear to.
  const tabBarSpace = useTabBarSpace();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentUser, userFlat } = useAuth();
  const [chores, setChores] = useState<Chore[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  // The strip picks a day, and the day is what the roster is read for — each
  // chore resolving it against its own cadence. Both start at local midnight
  // today, and `today` is held separately so the strip can keep marking it
  // once the selection has moved off.
  const getTodayStart = useCallback(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const [today, setToday] = useState<Date>(() => getTodayStart());
  const [selectedDate, setSelectedDate] = useState<Date>(() => getTodayStart());
  const [previewDate, setPreviewDate] = useState<Date>(() => getTodayStart());
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
      const todayStart = getTodayStart();
      setToday(todayStart);
      setSelectedDate(todayStart);
      setPreviewDate(todayStart);
      load();
    }, [getTodayStart, load]),
  );

  // Chore management moved here from Settings — the tab bar's "+" opens the
  // form for a new chore, and each row in the list below reopens it to edit.
  const [choreForm, setChoreForm] = useState<{ open: boolean; chore: Chore | null }>({
    open: false,
    chore: null,
  });
  const [expandedChoreId, setExpandedChoreId] = useState<string | null>(null);
  // Collapsed by default: the day's roster is what the tab is for, and the
  // full list is long enough to bury it.
  const [showAllChores, setShowAllChores] = useState(false);

  useRegisterAddAction("House", () => setChoreForm({ open: true, chore: null }));

  const submitChoreForm = async (values: ChoreFormValues) => {
    if (!userFlat) return;
    if (choreForm.chore) await choresService.updateChore(userFlat.id, choreForm.chore.id, values);
    else await choresService.addChore(userFlat.id, values);
    await load();
  };

  const deleteChore = async (choreId: string) => {
    if (!userFlat) return;
    if (expandedChoreId === choreId) setExpandedChoreId(null);
    await choresService.deleteChore(userFlat.id, choreId);
    await load();
  };

  const choresByFrequency = useMemo(
    () =>
      FREQUENCIES.map((freq) => ({ freq, items: chores.filter((c) => c.frequency === freq) })).filter(
        (g) => g.items.length > 0,
      ),
    [chores],
  );

  // What each chore looks like on the selected day. A weekly chore is the same
  // all week and a monthly one all month, so this only really changes day to
  // day for the daily ones — which is exactly the point of picking a day.
  //
  // `Completion.week` is the *period* a completion belongs to, not a week
  // index: a week for weekly chores, a day for daily, a month for monthly.
  // The field kept its old name because it's the wire and column name too.
  const assignmentsForDay = useMemo<Assignment[]>(() => {
    if (!userFlat) return [];
    const flatMemberIds = userFlat.members.map((m) => m.userId);
    const completionByChorePeriod = new Map(completions.map((c) => [`${c.choreId}:${c.week}`, c]));

    const assignedTo = assignChores(chores, flatMemberIds, selectedDate);

    return chores.map((chore) => ({
      chore,
      assignedUserId: assignedTo.get(chore.id) ?? null,
      done:
        completionByChorePeriod.get(`${chore.id}:${getPeriodIndex(chore.frequency, selectedDate)}`)?.done ??
        false,
    }));
  }, [chores, completions, userFlat, selectedDate]);

  // The marker under each day in the strip: green once everything standing on
  // that day is done, accent while any of it is outstanding. Genuinely per-day
  // — a daily chore moves on every tile, while the weekly and monthly ones it
  // shares the day with hold their state across the run they belong to.
  //
  // Cached by day, because the strip asks again every time a tile scrolls back
  // into view and the answer can't have changed in between.
  const dotFor = useMemo(() => {
    const cache = new Map<number, string | null>();
    const flatMemberIds = userFlat?.members.map((m) => m.userId) ?? [];
    const completionByChorePeriod = new Map(completions.map((c) => [`${c.choreId}:${c.week}`, c]));

    return (date: Date) => {
      const dayIndex = getDayIndex(date);
      const cached = cache.get(dayIndex);
      if (cached !== undefined) return cached;

      const assignedTo = assignChores(chores, flatMemberIds, date);
      let total = 0;
      let done = 0;
      for (const chore of chores) {
        if (!assignedTo.get(chore.id)) continue;
        total += 1;
        if (completionByChorePeriod.get(`${chore.id}:${getPeriodIndex(chore.frequency, date)}`)?.done) {
          done += 1;
        }
      }

      // A day with nothing on it draws nothing at all, rather than a grey dot
      // that has to be told apart from a live one at 6pt across.
      const color = total === 0 ? null : done === total ? colors.success : colors.accentInk;
      cache.set(dayIndex, color);
      return color;
    };
  }, [chores, completions, userFlat, colors.success, colors.accentInk]);

  // Every flatmate gets a card, including those with nothing on this week —
  // they read as "Off Duty" rather than silently vanishing from the roster.
  const rosterCards = useMemo(() => {
    if (!userFlat) return [];
    const byMember = new Map<string, Assignment[]>(userFlat.members.map((m) => [m.userId, []]));
    for (const a of assignmentsForDay) {
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
        mainDone: main.filter((i) => i.done).length,
        allMainDone: main.length > 0 && main.every((i) => i.done),
      };
    });
  }, [assignmentsForDay, userFlat]);

  const doneCount = assignmentsForDay.filter((a) => a.done).length;

  const setDone = async (items: Assignment[], nextDone: boolean) => {
    if (!userFlat) return;
    const targets = items.filter((i) => i.assignedUserId);
    if (targets.length === 0) return;

    // Each chore is stored against its own cadence's period, so a mixed
    // selection writes to a mix of day, week and month slots.
    const periodOf = (chore: Chore) => getPeriodIndex(chore.frequency, selectedDate);

    setCompletions((prev) => {
      const touched = new Map(targets.map((t) => [t.chore.id, periodOf(t.chore)]));
      const others = prev.filter((c) => touched.get(c.choreId) !== c.week);
      return [
        ...others,
        ...targets.map((t) => ({
          choreId: t.chore.id,
          week: periodOf(t.chore),
          assignedUserId: t.assignedUserId!,
          done: nextDone,
        })),
      ];
    });

    await Promise.all(
      targets.map((t) =>
        completionsService.saveCompletion(userFlat.id, {
          choreId: t.chore.id,
          week: periodOf(t.chore),
          assignedUserId: t.assignedUserId!,
          done: nextDone,
        }),
      ),
    );
  };

  if (!userFlat) return null;

  return (
    <View style={styles.root}>
      <ScrollView
        style={[styles.container, { paddingTop: insets.top + HEADER_TITLE_TOP }]}
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
      >
        <Text style={styles.pageTitle}>Chores</Text>

        <RevealTile delay={0}>
          <DayStrip
            selected={selectedDate}
            today={today}
            onSelect={setSelectedDate}
            onPreview={setPreviewDate}
            dotFor={dotFor}
          />
        </RevealTile>

        {/* Names the day in full. Only the daily chores actually change from
            one tile to the next, so without this, tapping along a week looks
            like nothing happened. */}
        <Text style={styles.stats}>
          {previewDate.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} ·{" "}
          {doneCount}/{assignmentsForDay.length} done
        </Text>

        {rosterCards.map((card, index) => {
          const offDuty = card.items.length === 0;
          const expanded = expandedUserId === card.member.userId;
          const background = card.member.color ?? colors.accent;
          const ink = inkFor(background);
          // Each job is its own outlined chip on one line — the row clips
          // rather than wraps, so every card keeps the same height.
          const taskNames = card.main.length === 0 ? ["Off Duty"] : card.main.map((i) => i.chore.name);
          const shownNames = taskNames.slice(0, MAX_TASK_CHIPS);
          const truncated = taskNames.length > shownNames.length;
          // A single weekly chore says everything on the front of the card, so
          // the drop-down shows its description instead of repeating the name.
          const showLoneDescription = card.main.length === 1 && card.monthly.length === 0;

          return (
            <RevealTile key={card.member.userId} delay={REVEAL_STEP * (1 + Math.min(index, MAX_STAGGER))}>
              <Pressable
                style={({ pressed }) => [
                  styles.choreCard,
                  { backgroundColor: background },
                  pressed && !offDuty && styles.choreCardPressed,
                ]}
                onPress={() => !offDuty && setExpandedUserId(expanded ? null : card.member.userId)}
                disabled={offDuty}
              >
                <View style={styles.cardHeaderRow}>
                  <Avatar member={card.member} size={CARD_AVATAR} fg={ink.strong} />
                  <View style={styles.choreInfo}>
                    <Text style={[styles.choreName, { color: ink.strong }]} numberOfLines={1}>
                      {card.displayName}
                    </Text>
                    <View style={styles.choreTaskRow}>
                      {shownNames.map((name) => (
                        <View key={name} style={[styles.taskChip, { borderColor: ink.body }]}>
                          <Text style={[styles.taskChipText, { color: ink.body }]} numberOfLines={1}>
                            {name}
                          </Text>
                        </View>
                      ))}
                      {truncated && <Text style={[styles.taskOverflow, { color: ink.muted }]}>…</Text>}
                      {card.monthly.length > 0 && (
                        <Text style={[styles.monthlyCardBadge, { color: ink.onStrong, backgroundColor: ink.strong }]}>
                          M
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* One job: the drop-down only carries its description, so the
                      box stays the way to tick it. Several: it's a read-out of
                      how many are done, ticked off individually below, because a
                      single tap clearing four jobs at once was too easy to hit. */}
                  {card.main.length === 1 && (
                    <Pressable
                      onPress={() => setDone(card.main, !card.allMainDone)}
                      hitSlop={10}
                      style={[
                        styles.checkbox,
                        { borderColor: ink.strong },
                        card.allMainDone && { backgroundColor: ink.strong },
                      ]}
                    >
                      {card.allMainDone && <Text style={[styles.checkmark, { color: ink.onStrong }]}>✓</Text>}
                    </Pressable>
                  )}

                  {card.main.length > 1 && (
                    <View style={[styles.checkbox, { borderColor: ink.strong }]}>
                      <PieFill
                        styles={styles}
                        progress={card.mainDone / card.main.length}
                        color={ink.strong}
                      />
                      {card.allMainDone && <Text style={[styles.checkmark, { color: ink.onStrong }]}>✓</Text>}
                    </View>
                  )}
                </View>

                {expanded && (
                  <View style={[styles.details, { borderTopColor: ink.hairline }]}>
                    {showLoneDescription && (
                      <Text style={[styles.detailText, { color: ink.body }]}>
                        {card.main[0].chore.description?.trim() || "No description added."}
                      </Text>
                    )}

                    {!showLoneDescription &&
                      card.main.map((item, i) => (
                        <View
                          key={item.chore.id}
                          style={[
                            styles.subTaskRow,
                            { borderBottomColor: ink.hairline },
                            i === card.main.length - 1 && card.monthly.length === 0 && styles.subTaskRowLast,
                          ]}
                        >
                          <View style={styles.subTaskInfo}>
                            <Text style={[styles.subTaskName, { color: ink.body }]}>{item.chore.name}</Text>
                            {!!item.chore.description?.trim() && (
                              <Text style={[styles.subTaskDesc, { color: ink.muted }]}>{item.chore.description}</Text>
                            )}
                          </View>
                          <Pressable
                            onPress={() => setDone([item], !item.done)}
                            hitSlop={10}
                            style={[
                              styles.checkbox,
                              { borderColor: ink.strong },
                              item.done && { backgroundColor: ink.strong },
                            ]}
                          >
                            {item.done && <Text style={[styles.checkmark, { color: ink.onStrong }]}>✓</Text>}
                          </Pressable>
                        </View>
                      ))}

                    {card.monthly.map((item, i) => (
                      <View
                        key={item.chore.id}
                        style={[
                          styles.subTaskRow,
                          { borderBottomColor: ink.hairline },
                          i === card.monthly.length - 1 && styles.subTaskRowLast,
                        ]}
                      >
                        <View style={styles.subTaskInfo}>
                          <Text style={[styles.monthlyBadge, { color: ink.onStrong, backgroundColor: ink.strong }]}>
                            Monthly
                          </Text>
                          <Text style={[styles.subTaskName, { color: ink.body }]}>{item.chore.name}</Text>
                          {!!item.chore.description?.trim() && (
                            <Text style={[styles.subTaskDesc, { color: ink.muted }]}>{item.chore.description}</Text>
                          )}
                        </View>
                        <Pressable
                          onPress={() => setDone([item], !item.done)}
                          hitSlop={10}
                          style={[
                            styles.checkbox,
                            { borderColor: ink.strong },
                            item.done && { backgroundColor: ink.strong },
                          ]}
                        >
                          {item.done && <Text style={[styles.checkmark, { color: ink.onStrong }]}>✓</Text>}
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </Pressable>
            </RevealTile>
          );
        })}

        {chores.length === 0 && <Text style={styles.empty}>No chores yet — tap + to add one.</Text>}

        {choresByFrequency.length > 0 && (
          <RevealTile delay={REVEAL_STEP * (2 + Math.min(rosterCards.length, MAX_STAGGER))}>
            <Pressable
              style={styles.manageTitleRow}
              onPress={() => setShowAllChores((open) => !open)}
              hitSlop={6}
            >
              <Text style={styles.manageTitle}>All chores</Text>
              <Text style={styles.manageCount}>{chores.length}</Text>
              <Ionicons
                name={showAllChores ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
            {showAllChores &&
              choresByFrequency.map(({ freq, items }) => (
                <View key={freq}>
                  <Text style={styles.groupLabel}>{freq}</Text>
                  {items.map((chore) => {
                    const expanded = expandedChoreId === chore.id;
                    const choreMembers = userFlat.members.filter((m) => chore.memberIds.includes(m.userId));
                    return (
                      <View key={chore.id} style={styles.manageCard}>
                        <Pressable
                          style={styles.manageCardHeader}
                          onPress={() => setExpandedChoreId(expanded ? null : chore.id)}
                        >
                          <View style={styles.flex1}>
                            <Text style={styles.manageChoreName}>{chore.name}</Text>
                            <View style={styles.choreFreqBadge}>
                              <Text style={styles.choreFreqBadgeText}>{chore.frequency}</Text>
                            </View>
                          </View>
                          <View style={styles.choreActions}>
                            <Pressable
                              style={styles.iconButton}
                              onPress={() => setChoreForm({ open: true, chore })}
                              hitSlop={8}
                            >
                              <Ionicons name="pencil" size={13} color={colors.textMuted} />
                            </Pressable>
                            <Pressable style={styles.iconButton} onPress={() => deleteChore(chore.id)} hitSlop={8}>
                              <Ionicons name="trash-outline" size={13} color={colors.danger} />
                            </Pressable>
                            <Text style={styles.chevron}>{expanded ? "−" : "+"}</Text>
                          </View>
                        </Pressable>
                        {expanded && (
                          <View style={styles.manageCardBody}>
                            {chore.description?.trim() ? (
                              <Text style={styles.choreDescription}>{chore.description}</Text>
                            ) : (
                              <Text style={styles.choreDescEmpty}>No description.</Text>
                            )}
                            {choreMembers.length > 0 ? (
                              <View style={styles.choreMemberRow}>
                                {choreMembers.map((m) => (
                                  <View
                                    key={m.userId}
                                    style={[styles.choreMemberChip, { backgroundColor: m.color ?? colors.accent }]}
                                  >
                                    <Text style={styles.choreMemberChipText}>{m.displayName}</Text>
                                  </View>
                                ))}
                              </View>
                            ) : (
                              <Text style={styles.choreDescEmpty}>All flatmates.</Text>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
          </RevealTile>
        )}
      </ScrollView>

      <ChoreFormModal
        visible={choreForm.open}
        chore={choreForm.chore}
        members={userFlat.members}
        onClose={() => setChoreForm({ open: false, chore: null })}
        onSubmit={submitChoreForm}
      />
      <SettingsButton />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    container: { flex: 1, padding: 16, backgroundColor: colors.bg },
    pageTitle: {
      fontFamily: fonts.regular,
      fontSize: 28,
      letterSpacing: -0.7,
      // Explicit, and the same 31pt the home greeting uses: the line box is
      // what fixes where the title sits, so every tab's title lands on the
      // same height and the settings gear centres on all of them alike.
      lineHeight: 31,
      color: colors.textMuted,
      // Clears the gear button pinned in the corner.
      paddingRight: 36,
      marginBottom: 16,
    },
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
    // Every card is the full column width and, collapsed, exactly one header
    // tall — the chip row clips instead of wrapping to keep it that way.
    choreCard: { borderRadius: 12, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 10 },
    choreCardPressed: { transform: [{ scale: 0.98 }] },
    cardHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      height: CARD_HEADER_HEIGHT,
    },
    choreInfo: { flex: 1 },
    choreName: {
      fontFamily: fonts.display,
      fontSize: 26,
      textTransform: "uppercase",
      letterSpacing: -1,
    },
    choreTaskRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "nowrap",
      overflow: "hidden",
      gap: 6,
      marginTop: 4,
    },
    // Outline only: the card is already a solid block of colour, so a filled
    // chip on top of it would read as a second, competing surface.
    taskChip: {
      flexShrink: 1,
      borderWidth: 1.5,
      borderRadius: 6,
      paddingVertical: 2,
      paddingHorizontal: 7,
    },
    taskChipText: {
      fontFamily: fonts.bold,
      fontSize: 13,
      letterSpacing: -0.3,
    },
    taskOverflow: { fontFamily: fonts.bold, fontSize: 15, letterSpacing: 1 },
    monthlyCardBadge: {
      fontFamily: fonts.bold,
      fontSize: 9,
      textTransform: "uppercase",
      letterSpacing: 1,
      borderRadius: 4,
      paddingVertical: 1,
      paddingHorizontal: 5,
      overflow: "hidden",
    },

    // Border and fill both come from the card's own ink, so the tick reads
    // against an arbitrary flatmate colour, pastel or deep.
    checkbox: {
      width: 24,
      height: 24,
      borderWidth: 3,
      borderRadius: 6,
      backgroundColor: "transparent",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    // The pie is squared off by the box clipping it, so the last slice lands
    // as a solid tick box rather than a circle floating in a square.
    pie: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
    pieWindowRight: { position: "absolute", top: 0, bottom: 0, left: PIE_HALF, width: PIE_HALF, overflow: "hidden" },
    pieWindowLeft: { position: "absolute", top: 0, bottom: 0, left: 0, width: PIE_HALF, overflow: "hidden" },
    // Overhangs the window so the corners of the box still fill in.
    pieSliceRight: {
      position: "absolute",
      left: 0,
      top: PIE_HALF - PIE_RADIUS,
      width: PIE_RADIUS,
      height: PIE_RADIUS * 2,
      borderTopRightRadius: PIE_RADIUS,
      borderBottomRightRadius: PIE_RADIUS,
      transformOrigin: "left center",
    },
    pieSliceLeft: {
      position: "absolute",
      right: 0,
      top: PIE_HALF - PIE_RADIUS,
      width: PIE_RADIUS,
      height: PIE_RADIUS * 2,
      borderTopLeftRadius: PIE_RADIUS,
      borderBottomLeftRadius: PIE_RADIUS,
      transformOrigin: "right center",
    },
    checkmark: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 16 },

    // ── Drop-down detail ──
    details: { width: "100%", marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
    detailText: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
    subTaskRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
    },
    subTaskRowLast: { borderBottomWidth: 0 },
    subTaskInfo: { flex: 1 },
    subTaskName: {
      fontFamily: fonts.bold,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: -0.3,
    },
    subTaskDesc: { fontFamily: fonts.regular, fontSize: 10, marginTop: 3, lineHeight: 14 },
    monthlyBadge: {
      alignSelf: "flex-start",
      fontFamily: fonts.bold,
      fontSize: 8,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      borderRadius: 4,
      paddingVertical: 2,
      paddingHorizontal: 6,
      marginBottom: 4,
      overflow: "hidden",
    },

    empty: { fontFamily: fonts.regular, textAlign: "center", color: colors.textMuted, marginBottom: 16 },
    flex1: { flex: 1 },

    // --- chore management, moved here from the Settings screen -------------
    manageTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 28,
      marginBottom: 4,
      paddingVertical: 4,
    },
    manageTitle: {
      fontFamily: fonts.display,
      fontSize: typeScale.subheading,
      letterSpacing: 1,
      color: colors.text,
    },
    // Sits next to the title so the collapsed section still says how much is
    // behind it.
    manageCount: {
      flex: 1,
      fontFamily: fonts.bold,
      fontSize: typeScale.caption,
      color: colors.textMuted,
    },
    groupLabel: {
      fontFamily: fonts.bold,
      fontSize: typeScale.caption,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      color: colors.textMuted,
      marginTop: 14,
      marginBottom: 6,
    },
    manageCard: {
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      marginBottom: 8,
    },
    manageCardHeader: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
    manageChoreName: { fontFamily: fonts.bold, fontSize: typeScale.body, color: colors.text },
    manageCardBody: {
      paddingHorizontal: 12,
      paddingBottom: 12,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 10,
    },
    choreFreqBadge: { alignSelf: "flex-start", backgroundColor: colors.accentSoft, borderRadius: 4, paddingVertical: 2, paddingHorizontal: 6, marginTop: 4 },
    choreFreqBadgeText: {
      fontFamily: fonts.bold,
      fontSize: typeScale.caption,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: colors.accent,
    },
    choreActions: { flexDirection: "row", alignItems: "center", gap: 4 },
    iconButton: { padding: 6 },
    chevron: { fontFamily: fonts.bold, fontSize: typeScale.body, color: colors.textMuted, paddingHorizontal: 4 },
    choreDescription: { fontFamily: fonts.regular, fontSize: typeScale.caption, color: colors.text },
    choreDescEmpty: { fontFamily: fonts.regular, fontSize: typeScale.caption, color: colors.textMuted, fontStyle: "italic" },
    choreMemberRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    choreMemberChip: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
    choreMemberChipText: {
      fontFamily: fonts.bold,
      fontSize: typeScale.caption,
      letterSpacing: 0.5,
      color: "rgba(0,0,0,0.75)",
    },
  });
}
