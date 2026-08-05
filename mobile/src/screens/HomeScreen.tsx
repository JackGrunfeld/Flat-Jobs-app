import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Animated } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import * as choresService from "../services/choresService";
import * as completionsService from "../services/completionsService";
import * as shoppingService from "../services/shoppingService";
import * as settlementsService from "../services/settlementsService";
import { useTypewriterCycle } from "../hooks/useTypewriterCycle";
import { getCurrentWeek, getPeriodIndex } from "../utils/rosterHelpers";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import SettingsButton from "../components/SettingsButton";
import CalendarStrip from "../components/CalendarStrip";
import {
  addMonths,
  buildBirthdayEventsInRange,
  mergeCalendarEvents,
  startOfToday,
  toCalendarEvents,
  toISODate,
} from "../utils/calendarEvents";
import * as eventsService from "../services/eventsService";
import type { MainTabParamList } from "../navigation/MainTabNavigator";
import type { Chore, Completion, ShoppingItem, Balance, FlatEvent, NewFlatEvent } from "../types";

// Months either side of today that the calendar can be swiped to. Doubles as
// the window birthday events are built over, so every month reachable by a
// swipe has its rings — the two must stay in step.
const CALENDAR_MONTH_RANGE = 12;

// Full height of each stacked card, and how much of it stays visible once the
// next card overlaps it. The exposed band is what carries that card's
// information, so it has to fit label + stat + caption.
// EXPOSED_HEIGHT has to clear padding + icon row + stat + caption (~102pt) or
// the covered cards lose their caption to the overlap.
const CARD_HEIGHT = 146;
const EXPOSED_HEIGHT = 112;

type Segment = { text: string; bold?: boolean };
type Nav = BottomTabNavigationProp<MainTabParamList>;
type TileTone = { fg: string; soft: string };

const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function periodForHour(hour: number) {
  if (hour < 5) return "evening";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function buildGreetingSegments(period: string, firstName: string): Segment[] {
  const segments: Segment[] = [{ text: `Good ${period}` }];
  if (firstName) segments.push({ text: ", " }, { text: firstName, bold: true });
  return segments;
}

// Staggered fade-up on mount/focus — each tile waits `delay` ms before
// tweening in, so the dashboard reveals itself tile-by-tile instead of
// popping in as a flat block.
function RevealTile({ delay, children }: { delay: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 420, delay, useNativeDriver: true }).start();
    }, [anim, delay]),
  );

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

// One layer of the stack. Every card is CARD_HEIGHT tall, but each is pulled
// up over the one before so only EXPOSED_HEIGHT of it shows — enough for the
// label, stat and caption. The bottom card is the only one shown in full.
function StackCard({
  index,
  icon,
  label,
  stat,
  caption,
  tone,
  toneSoft,
  onPress,
  styles,
}: {
  index: number;
  icon: (color: string) => React.ReactNode;
  label: string;
  stat: string;
  caption: string;
  // The metric's colour. Carried by the outline, icon chip and stat rather
  // than by a solid fill — the surface stays neutral, the way every other
  // card on this screen reads.
  tone: string;
  toneSoft: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.stackCard,
        {
          borderColor: tone,
          // First card sits flush; the rest overlap the card above.
          marginTop: index === 0 ? 0 : EXPOSED_HEIGHT - CARD_HEIGHT,
          // Later siblings already paint on top on iOS; this makes the order
          // explicit and holds on Android too.
          zIndex: index,
        },
      ]}
    >
      <View style={styles.stackHeader}>
        <View style={[styles.stackIcon, { backgroundColor: toneSoft }]}>{icon(tone)}</View>
        <Text style={[styles.stackLabel, { color: tone }]}>{label}</Text>
      </View>
      <Text style={[styles.stackStat, { color: tone }]}>{stat}</Text>
      <Text style={styles.stackCaption}>{caption}</Text>
    </Pressable>
  );
}

// Top-of-screen typed greeting (same SpaceMono treatment as AuthScreen's
// subtitle), a rotating one-line status ticker built from whatever actually
// needs attention, then a grid of tappable stat tiles — chores assigned to
// the signed-in user this week, their net balance, and the shopping list —
// each colour-coded and routing into the tab it summarises.
export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentUser, userFlat } = useAuth();

  const firstName = currentUser?.displayName?.trim().split(/\s+/)[0] ?? "";
  const segments = buildGreetingSegments(periodForHour(new Date().getHours()), firstName);
  const totalLength = segments.reduce((sum, seg) => sum + seg.text.length, 0);

  const [visibleChars, setVisibleChars] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);

  // Refreshed on focus rather than memoised once, so the strip rolls over if
  // the app sits open past midnight.
  const [today, setToday] = useState(startOfToday);

  const [chores, setChores] = useState<Chore[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [flatEvents, setFlatEvents] = useState<FlatEvent[]>([]);

  // The window the calendar can be swiped across — the same bounds the
  // birthday events are derived over, so both sources cover the same months.
  const calendarWindow = useMemo(
    () => ({
      from: toISODate(addMonths(today, -CALENDAR_MONTH_RANGE)),
      to: toISODate(addMonths(today, CALENDAR_MONTH_RANGE)),
    }),
    [today],
  );

  const loadEvents = useCallback(async () => {
    if (!userFlat) return;
    const { events } = await eventsService.fetchEvents(userFlat.id, calendarWindow.from, calendarWindow.to);
    setFlatEvents(events);
  }, [userFlat, calendarWindow]);

  const load = useCallback(async () => {
    if (!userFlat) return;
    const [choresRes, completionsRes, itemsRes, balancesRes] = await Promise.all([
      choresService.fetchChores(userFlat.id),
      completionsService.fetchCompletions(userFlat.id),
      shoppingService.fetchShoppingItems(userFlat.id),
      settlementsService.fetchBalances(userFlat.id),
      // Kept out of the destructure: an older deployed API without /events
      // shouldn't blank the whole dashboard, so this one is allowed to fail.
      loadEvents().catch(() => {}),
    ]);
    setChores(choresRes.chores);
    setCompletions(completionsRes.completions);
    setItems(itemsRes.items);
    setBalances(balancesRes.balances);
  }, [userFlat, loadEvents]);

  const createEvent = useCallback(
    async (input: NewFlatEvent) => {
      if (!userFlat) return;
      await eventsService.createEvent(userFlat.id, input);
      await loadEvents();
    },
    [userFlat, loadEvents],
  );

  useFocusEffect(
    useCallback(() => {
      setVisibleChars(0);
      // Keeps the same Date instance while the calendar day hasn't changed.
      // A fresh object every focus would feed `calendarWindow` -> `loadEvents`
      // -> `load` -> this very callback, re-running the effect forever.
      setToday((prev) => {
        const refreshed = startOfToday();
        return prev.getTime() === refreshed.getTime() ? prev : refreshed;
      });
      load();
    }, [load]),
  );

  useEffect(() => {
    if (visibleChars >= totalLength) return;
    const timer = setTimeout(() => setVisibleChars((c) => c + 1), 45);
    return () => clearTimeout(timer);
  }, [visibleChars, totalLength]);

  useEffect(() => {
    const blink = setInterval(() => setCursorOn((v) => !v), 500);
    return () => clearInterval(blink);
  }, []);

  const myChoreStats = useMemo(() => {
    if (!userFlat || !currentUser) return { total: 0, done: 0 };
    const week = getCurrentWeek();
    const flatMemberIds = userFlat.members.map((m) => m.userId);
    const completionByChoreWeek = new Map(completions.map((c) => [`${c.choreId}:${c.week}`, c]));
    let total = 0;
    let done = 0;
    for (const chore of chores) {
      const pool = chore.memberIds.length > 0 ? chore.memberIds : flatMemberIds;
      const periodIndex = getPeriodIndex(chore.frequency, week);
      const assignedUserId = pool.length > 0 ? pool[periodIndex % pool.length] : null;
      if (assignedUserId !== currentUser.id) continue;
      total += 1;
      if (completionByChoreWeek.get(`${chore.id}:${week}`)?.done) done += 1;
    }
    return { total, done };
  }, [chores, completions, userFlat, currentUser]);

  const moneySummary = useMemo(() => {
    if (!currentUser) return { owe: 0, owed: 0 };
    const owe = balances.filter((b) => b.userId === currentUser.id).reduce((sum, b) => sum + b.amountCents, 0);
    const owed = balances.filter((b) => b.owesUserId === currentUser.id).reduce((sum, b) => sum + b.amountCents, 0);
    return { owe, owed };
  }, [balances, currentUser]);

  const choresLeft = myChoreStats.total - myChoreStats.done;

  // Only the things actually worth mentioning make the cut — the ticker
  // never nags about a fully caught-up flat, it just says so.
  const nudges = useMemo(() => {
    const list: string[] = [];
    if (choresLeft > 0) list.push(`${choresLeft} chore${choresLeft === 1 ? "" : "s"} waiting on you`);
    if (moneySummary.owe > 0) list.push(`Someone's owed ${formatMoney(moneySummary.owe)}`);
    if (moneySummary.owed > 0) list.push(`You're owed ${formatMoney(moneySummary.owed)} — chase it down`);
    if (items.length === 0) list.push("Fridge check — the list is empty");
    if (list.length === 0) list.push("All caught up. Flat's in good shape.");
    return list;
  }, [choresLeft, moneySummary, items.length]);

  const { text: nudgeText, cursorOn: nudgeCursorOn } = useTypewriterCycle(nudges, { pauseMs: 2200 });

  const calendarEvents = useMemo(
    () =>
      mergeCalendarEvents(
        buildBirthdayEventsInRange(
          userFlat?.members ?? [],
          currentUser,
          addMonths(today, -CALENDAR_MONTH_RANGE),
          addMonths(today, CALENDAR_MONTH_RANGE),
        ),
        toCalendarEvents(flatEvents),
      ),
    [userFlat, currentUser, today, flatEvents],
  );

  if (!userFlat || !currentUser) return null;

  let consumed = 0;
  const greetingNodes: React.ReactNode[] = segments.map((seg, idx) => {
    const shown = seg.text.slice(0, Math.max(0, Math.min(visibleChars - consumed, seg.text.length)));
    consumed += seg.text.length;
    return seg.bold ? (
      <Text key={idx} style={styles.greetingName}>
        {shown}
      </Text>
    ) : (
      shown
    );
  });

  // Each metric's colour pair: `fg` outlines the card and carries its label
  // and stat, `soft` tints the icon chip behind it.
  const choreTone: TileTone =
    myChoreStats.total === 0
      ? { fg: colors.textMuted, soft: colors.surfaceAlt }
      : choresLeft === 0
        ? { fg: colors.success, soft: colors.successSoft }
        : { fg: colors.accent, soft: colors.accentSoft };
  const choreStat = myChoreStats.total === 0 ? "—" : `${myChoreStats.done}/${myChoreStats.total}`;
  const choreCaption =
    myChoreStats.total === 0
      ? "Nothing assigned. Lucky you."
      : choresLeft === 0
        ? "All caught up. Legend."
        : `${choresLeft} chore${choresLeft === 1 ? "" : "s"} left this week`;

  const balanceTone: TileTone =
    moneySummary.owe > 0
      ? { fg: colors.danger, soft: colors.dangerSoft }
      : moneySummary.owed > 0
        ? { fg: colors.success, soft: colors.successSoft }
        : { fg: colors.textMuted, soft: colors.surfaceAlt };
  const balanceStat =
    moneySummary.owe > 0
      ? formatMoney(moneySummary.owe)
      : moneySummary.owed > 0
        ? formatMoney(moneySummary.owed)
        : "$0.00";
  const balanceCaption =
    moneySummary.owe > 0 ? "Time to settle up" : moneySummary.owed > 0 ? "Cha-ching — come collect" : "Squeaky clean";

  const shoppingTone: TileTone =
    items.length === 0
      ? { fg: colors.textMuted, soft: colors.surfaceAlt }
      : { fg: colors.info, soft: colors.infoSoft };
  const shoppingCaption = items.length === 0 ? "Cart's empty" : `item${items.length === 1 ? "" : "s"} on the list`;

  return (
    <View style={styles.root}>
      <ScrollView style={[styles.container, { paddingTop: insets.top + 60 }]}>
        <Text style={styles.greeting}>
          {greetingNodes}
          <Text style={[styles.cursor, { opacity: cursorOn ? 1 : 0 }]}>▌</Text>
        </Text>

        <Text style={styles.nudge}>
          {nudgeText}
          <Text style={[styles.cursor, { opacity: nudgeCursorOn ? 1 : 0 }]}>▌</Text>
        </Text>

        <View style={styles.calendarWrap}>
          <RevealTile delay={0}>
            <CalendarStrip
              events={calendarEvents}
              today={today}
              monthRange={CALENDAR_MONTH_RANGE}
              onCreateEvent={createEvent}
            />
          </RevealTile>
        </View>

        {/* Overlapping layers rather than a grid: each card's exposed band
            carries its own metric, and tapping any layer opens its tab. */}
        <View style={styles.stack}>
          <StackCard
            index={0}
            icon={(color) => <MaterialCommunityIcons name="broom" size={17} color={color} />}
            label="Chores"
            stat={choreStat}
            caption={choreCaption}
            tone={choreTone.fg}
            toneSoft={choreTone.soft}
            onPress={() => navigation.navigate("House")}
            styles={styles}
          />
          <StackCard
            index={1}
            icon={(color) => <Ionicons name="cash-outline" size={17} color={color} />}
            label="Balance"
            stat={balanceStat}
            caption={balanceCaption}
            tone={balanceTone.fg}
            toneSoft={balanceTone.soft}
            onPress={() => navigation.navigate("Splitwise")}
            styles={styles}
          />
          <StackCard
            index={2}
            icon={(color) => <Ionicons name="cart-outline" size={17} color={color} />}
            label="Shopping list"
            stat={String(items.length)}
            caption={shoppingCaption}
            tone={shoppingTone.fg}
            toneSoft={shoppingTone.soft}
            onPress={() => navigation.navigate("Shopping")}
            styles={styles}
          />
        </View>
      </ScrollView>
      <SettingsButton />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  greeting: {
    fontFamily: fonts.regular,
    fontSize: 24,
    letterSpacing: 3,
    color: colors.textMuted,
  },
  greetingName: { fontFamily: fonts.bold, color: colors.text },
  cursor: { fontFamily: fonts.bold, color: colors.accent },
  nudge: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 0.5,
    color: colors.accent,
    marginTop: 10,
  },
  // Carries the gap the removed "The Lowdown" heading used to provide, so the
  // tiles still read as their own section below the calendar.
  calendarWrap: { marginTop: 28, marginBottom: 26 },
  // Bottom padding clears the tab bar — the last card is full height, so
  // without it the stack's base would sit under the tabs.
  stack: { marginBottom: 40 },
  stackCard: {
    height: CARD_HEIGHT,
    // Opaque on purpose: the layers overlap, so a translucent fill would let
    // the card underneath bleed through and muddy the stack.
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    alignItems: "flex-start",
    // Lifts each layer off the one it covers so the overlap reads as depth
    // rather than as one flat shape.
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 6,
  },
  stackHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  stackIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  stackLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" },
  stackStat: { fontFamily: fonts.display, fontSize: 26, marginTop: 6 },
  stackCaption: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  });
}
