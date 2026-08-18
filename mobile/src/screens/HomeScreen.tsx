import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBarSpace } from "../navigation/FlatTabBar";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import * as choresService from "../services/choresService";
import * as completionsService from "../services/completionsService";
import * as shoppingService from "../services/shoppingService";
import * as settlementsService from "../services/settlementsService";
import { assignChores, getPeriodIndex } from "../utils/rosterHelpers";
import { useTheme } from "../context/ThemeContext";
import { CARD_TONES, onColor, withAlpha, CAL_PLATE } from "../theme/colors";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import SettingsButton from "../components/SettingsButton";
import CalendarStrip from "../components/CalendarStrip";
import { useRegisterAddAction } from "../navigation/AddActionContext";
import { useTypewriterCycle } from "../hooks/useTypewriterCycle";
import { initialsFor } from "../utils/initials";
import {
  addDays,
  addMonths,
  buildBirthdayEventsInRange,
  fromISODate,
  mergeCalendarEvents,
  relativeDayLabel,
  startOfToday,
  toCalendarEvents,
  toISODate,
  formatTime,
} from "../utils/calendarEvents";
import { EVENT_CATEGORIES, isBillCategory, recurrenceCaption } from "../theme/eventCategories";
import * as eventsService from "../services/eventsService";
import type { MainTabParamList } from "../navigation/MainTabNavigator";
import type { Chore, Completion, ShoppingItem, Balance, FlatEvent, NewFlatEvent } from "../types";

// Months either side of today that the calendar can be swiped to. Doubles as
// the window birthday events are built over, so every month reachable by a
// swipe has its rings — the two must stay in step.
const CALENDAR_MONTH_RANGE = 12;

// The mosaic's geometry. Deliberately mismatched: a tall tile on the left
// beside two shorter ones stacked on the right, with a wide short tile ruled
// off underneath. Sizes carry the hierarchy — chores are the thing you act on,
// so they get the big block, and the rest get the space their content needs
// rather than an equal share.
const BENTO_GAP = 12;
// Right column is two tiles plus the gap; the left tile matches their combined
// height so the two columns finish flush.
const BENTO_TOP = 122;
const BENTO_BOTTOM = 100;
const BENTO_TALL = BENTO_TOP + BENTO_GAP + BENTO_BOTTOM;
const BENTO_WIDE = 88;
// Face pile on the wide tile, and the disc on the tall one's attribution row.
const FACE = 28;
const FACE_LARGE = 34;
// How much each face slides under the one before it.
const FACE_OVERLAP = 9;

// The gear in the corner isn't part of the dashboard, so it stays out of the
// way until asked for: swiping up the page brings it down into place over this
// much scroll, and returning to the top puts it away again. Tied to the scroll
// offset rather than to a gesture of its own so it tracks the swipe itself —
// it arrives as far as you've pulled, not on a threshold being tripped. Short
// on purpose: the dashboard very nearly fits the screen (on a big phone it
// fits outright), so there's barely any scroll range to spend, and the content
// container below is padded to guarantee at least this much of it.
const SETTINGS_REVEAL = 40;
// How far above its resting place the button waits. Short: it's a drop into
// position, and the fade is what does most of the hiding.
const SETTINGS_DROP = 20;
// Past this much of the reveal it's solid enough to be worth tapping.
const SETTINGS_LIVE_AT = SETTINGS_REVEAL / 2;

// How far ahead the bills card counts as "due". A fortnight covers the weekly
// and fortnightly cadences outright and catches a monthly bill with enough
// warning to do something about it.
const BILL_HORIZON_DAYS = 14;

type Nav = BottomTabNavigationProp<MainTabParamList>;
type Styles = ReturnType<typeof createStyles>;

const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function periodForHour(hour: number) {
  if (hour < 5) return "evening";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

// Staggered fade-up on mount/focus — each tile waits `delay` ms before
// tweening in, so the dashboard reveals itself tile-by-tile instead of
// popping in as a flat block.
// `style` is what lets a tile also be a flex column of the mosaic — without it
// the wrapper sizes to its content and collapses the row it sits in.
function RevealTile({
  delay,
  style,
  children,
}: {
  delay: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 420, delay, useNativeDriver: true }).start();
    }, [anim, delay]),
  );

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// The pill that heads each tile — a category/status word set in a rounded
// recess. It's the tile's classification rather than its number, which is what
// lets the big text below be the value alone.
function Pill({ text, fg, styles }: { text: string; fg: string; styles: Styles }) {
  return (
    <View style={[styles.pill, { backgroundColor: withAlpha(fg, 0.16) }]}>
      <Text style={[styles.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

// Colour+initials disc. Falls back to the card's own foreground when a
// flatmate hasn't picked a colour yet, so it's never an invisible circle.
function Avatar({
  member,
  size,
  fg,
  styles,
}: {
  member: { displayName: string; color: string | null };
  size: number;
  fg: string;
  styles: Styles;
}) {
  const fill = member.color ?? withAlpha(fg, 0.3);
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: fill },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.38, color: onColor(fill) }]}>
        {initialsFor(member.displayName)}
      </Text>
    </View>
  );
}

// Shared shell for every tile in the mosaic: the fill, the radius, the press
// target, and the arrow that marks a tile as a way through to its tab. Each
// tile supplies its own body, which is the point of the layout — they carry
// genuinely different kinds of information rather than four copies of the same
// stat block.
function BentoCard({
  tone,
  height,
  flex,
  onPress,
  children,
  styles,
}: {
  // Fills the whole tile. Text on top takes whichever of black/white
  // contrasts better, so a tone is free to be as light or dark as it likes.
  tone: string;
  height?: number;
  flex?: number;
  onPress?: () => void;
  children: (fg: string) => React.ReactNode;
  styles: Styles;
}) {
  const fg = onColor(tone);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.bentoCard,
        { backgroundColor: tone, height, flex, opacity: pressed ? 0.92 : 1 },
      ]}
    >
      {children(fg)}
      {onPress && (
        <View style={[styles.bentoGo, { backgroundColor: withAlpha(fg, 0.16) }]}>
          <Ionicons name="arrow-forward" size={13} color={fg} />
        </View>
      )}
    </Pressable>
  );
}

// Top-of-screen typed greeting (same treatment as AuthScreen's
// subtitle), a rotating one-line status ticker built from whatever actually
// needs attention, then a grid of tappable stat tiles — chores assigned to
// the signed-in user this week, their net balance, and the shopping list —
// each colour-coded and routing into the tab it summarises.
export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  // The tab bar floats over the page, so the last row needs
  // somewhere to scroll clear to.
  const tabBarSpace = useTabBarSpace();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentUser, userFlat } = useAuth();

  const firstName = currentUser?.displayName?.trim().split(/\s+/)[0] ?? "";
  const greetingLead = `Good ${periodForHour(new Date().getHours())}`;
  const greetingText = `${greetingLead}${firstName ? `, ${firstName}` : ""}`;
  const { text: typedGreeting, cursorOn } = useTypewriterCycle([greetingText], {
    typeSpeed: 35,
    deleteSpeed: 26,
    pauseMs: 900,
    cursorBlinkMs: 420,
  });

  // Native-driven, so the button moves with the finger rather than a frame
  // behind it. The listener rides along on the same event purely to flip the
  // button's tap target on and off, which is a JS-side concern.
  const scrollY = useRef(new Animated.Value(0)).current;
  const [settingsLive, setSettingsLive] = useState(false);
  // Measured rather than taken from the window, so it's the scroll view's own
  // visible height whatever the tab bar and safe areas take out of it.
  const [viewportHeight, setViewportHeight] = useState(0);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          const live = event.nativeEvent.contentOffset.y > SETTINGS_LIVE_AT;
          setSettingsLive((prev) => (prev === live ? prev : live));
        },
      }),
    [scrollY],
  );

  const settingsReveal = useMemo(
    () => ({
      opacity: scrollY.interpolate({
        inputRange: [0, SETTINGS_REVEAL],
        outputRange: [0, 1],
        extrapolate: "clamp" as const,
      }),
      transform: [
        {
          translateY: scrollY.interpolate({
            inputRange: [0, SETTINGS_REVEAL],
            outputRange: [-SETTINGS_DROP, 0],
            extrapolate: "clamp" as const,
          }),
        },
      ],
    }),
    [scrollY],
  );

  // Refreshed on focus rather than memoised once, so the strip rolls over if
  // the app sits open past midnight.
  const [today, setToday] = useState(startOfToday);

  const [chores, setChores] = useState<Chore[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [flatEvents, setFlatEvents] = useState<FlatEvent[]>([]);
  const [openAddSignal, setOpenAddSignal] = useState(0);

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

  const updateEvent = useCallback(
    async (eventId: string, input: any) => {
      if (!userFlat) return;
      await eventsService.updateEvent(userFlat.id, eventId, input);
      await loadEvents();
    },
    [userFlat, loadEvents],
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      if (!userFlat) return;
      await eventsService.deleteEvent(userFlat.id, eventId);
      await loadEvents();
    },
    [userFlat, loadEvents],
  );

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

  useRegisterAddAction("Home", () => setOpenAddSignal((s) => s + 1));

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

  const myChoreStats = useMemo(() => {
    if (!userFlat || !currentUser) return { total: 0, done: 0 };
    // Read for today specifically, so a daily chore counts against whoever it
    // falls to *today* rather than whoever held it at the start of the week.
    const now = new Date();
    const flatMemberIds = userFlat.members.map((m) => m.userId);
    // Keyed by each chore's own period — a day, a week or a month depending on
    // its cadence. `Completion.week` is that period, despite the name.
    const completionByChorePeriod = new Map(completions.map((c) => [`${c.choreId}:${c.week}`, c]));
    const assignedTo = assignChores(chores, flatMemberIds, now);
    let total = 0;
    let done = 0;
    for (const chore of chores) {
      if (assignedTo.get(chore.id) !== currentUser.id) continue;
      total += 1;
      if (completionByChorePeriod.get(`${chore.id}:${getPeriodIndex(chore.frequency, now)}`)?.done) done += 1;
    }
    return { total, done };
  }, [chores, completions, userFlat, currentUser]);

  // The first chore still outstanding today, and the flatmate it falls to.
  // Drives the attribution row at the foot of the chores tile — the tile says
  // *who* is up, not just how many are left, which is the thing you'd actually
  // want to know at a glance.
  const nextChore = useMemo(() => {
    if (!userFlat) return null;
    const now = new Date();
    const memberIds = userFlat.members.map((m) => m.userId);
    const assignedTo = assignChores(chores, memberIds, now);
    const doneKeys = new Set(completions.filter((c) => c.done).map((c) => `${c.choreId}:${c.week}`));

    for (const chore of chores) {
      const userId = assignedTo.get(chore.id);
      if (!userId) continue;
      if (doneKeys.has(`${chore.id}:${getPeriodIndex(chore.frequency, now)}`)) continue;
      const member = userFlat.members.find((m) => m.userId === userId);
      if (member) return { chore, member };
    }
    return null;
  }, [chores, completions, userFlat]);

  // Distinct flatmates who've put something on the list, as a face pile. Caps
  // at four: past that the discs stop being individually readable and the
  // overflow count says it better.
  const listFaces = useMemo(() => {
    if (!userFlat) return { faces: [], extra: 0 };
    const ids = Array.from(new Set(items.map((i) => i.addedByUserId)));
    const members = ids
      .map((id) => userFlat.members.find((m) => m.userId === id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    return { faces: members.slice(0, 4), extra: Math.max(0, members.length - 4) };
  }, [items, userFlat]);

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
    if (items.length === 0) list.push("Fridge check — the list is empty");
    if (list.length === 0) list.push("All caught up. Flat's in good shape.");
    return list;
  }, [choresLeft, items.length]);

  const calendarEvents = useMemo(
    () =>
      mergeCalendarEvents(
        buildBirthdayEventsInRange(
          userFlat?.members ?? [],
          currentUser,
          addMonths(today, -CALENDAR_MONTH_RANGE),
          addMonths(today, CALENDAR_MONTH_RANGE),
        ),
        // Members come along so each event can take the ring colour of the
        // flatmate who created it; the window is what a repeating or
        // multi-day event gets expanded across, since a stored row is a rule
        // rather than a set of dates.
        toCalendarEvents(
          flatEvents,
          userFlat?.members ?? [],
          addMonths(today, -CALENDAR_MONTH_RANGE),
          addMonths(today, CALENDAR_MONTH_RANGE),
        ),
      ),
    [userFlat, currentUser, today, flatEvents],
  );

  // Bills are read straight off the calendar rather than kept anywhere of
  // their own: a bill *is* a dated thing with a category, and the recurrence
  // that makes rent turn up every month is already worked out for the strip
  // above. Two numbers, because they answer different questions — how much is
  // landing shortly, and what's next whenever that happens to be. Without the
  // second, a flat with rent three weeks out would read as having no bills.
  const billsDue = useMemo(() => {
    const todayISO = toISODate(today);
    const horizonISO = toISODate(addDays(today, BILL_HORIZON_DAYS));
    const upcoming = calendarEvents
      // `isStart` only: a bill that spans days would otherwise be counted once
      // per day it covers.
      .filter((event) => event.isStart && isBillCategory(event.category) && event.date >= todayISO)
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      soon: upcoming.filter((event) => event.date <= horizonISO).length,
      next: upcoming[0] ?? null,
    };
  }, [calendarEvents, today]);

  if (!userFlat || !currentUser) return null;

  const choreStat = myChoreStats.total === 0 ? "—" : `${myChoreStats.done}/${myChoreStats.total}`;
  const choreCaption =
    myChoreStats.total === 0
      ? "Nothing assigned. Lucky you."
      : choresLeft === 0
        ? "All caught up. Legend."
        : `${choresLeft} chore${choresLeft === 1 ? "" : "s"} left this week`;

  const balanceStat =
    moneySummary.owe > 0
      ? formatMoney(moneySummary.owe)
      : moneySummary.owed > 0
        ? formatMoney(moneySummary.owed)
        : "$0.00";
  const balanceCaption =
    moneySummary.owe > 0 ? "Time to settle up" : moneySummary.owed > 0 ? "Cha-ching — come collect" : "Squeaky clean";

  const shoppingCaption = items.length === 0 ? "Cart's empty" : `item${items.length === 1 ? "" : "s"} on the list`;

  const billStat = billsDue.soon === 0 ? "—" : String(billsDue.soon);
  const billCaption = billsDue.next
    ? [
        EVENT_CATEGORIES[billsDue.next.category!].label,
        billsDue.next.time ? formatTime(billsDue.next.time) : null,
        relativeDayLabel(fromISODate(billsDue.next.date) ?? today, today),
        billsDue.next.recurrence ? recurrenceCaption(billsDue.next.recurrence) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "No bills on the calendar";
  // The chip wears the next bill's own category icon, so the card says which
  // bill it's about before you've read a word of it.
  const billIcon = billsDue.next?.category
    ? EVENT_CATEGORIES[billsDue.next.category].icon
    : "receipt-outline";

  return (
    <View style={styles.root}>
      <View style={[styles.container, { paddingTop: insets.top + 6 }]}>
        {/* The dashboard scrolls. The calendar's height is dynamic (it grows
            with the month's week count), so a fixed block would run off the
            bottom of a shorter phone — which is exactly what it did. The
            calendar's own PanResponder only claims vertical drags that start
            on it, so month-turning still wins there and the page scrolls
            everywhere else. */}
        <Animated.ScrollView
          style={{ flex: 1 }}
          onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
          // minHeight guarantees scroll range even when the content is shorter
          // than the viewport, which is what the settings button rides on.
          contentContainerStyle={{
            paddingBottom: tabBarSpace + 12,
            minHeight: viewportHeight + SETTINGS_REVEAL,
          }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={styles.greeting}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {typedGreeting.startsWith(greetingLead) ? (
              <>
                <Text style={styles.greetingLead}>{greetingLead}</Text>
                {firstName ? (
                  <Text style={styles.greetingName}>{typedGreeting.slice(greetingLead.length)}</Text>
                ) : null}
                {!firstName && <Text style={styles.greetingLead}>{typedGreeting.slice(greetingLead.length)}</Text>}
              </>
            ) : (
              typedGreeting
            )}
            <Text style={[styles.cursor, { opacity: cursorOn ? 1 : 0 }]}>▌</Text>
          </Text>

          <View style={styles.calendarWrap}>
            <RevealTile delay={0}>
              <CalendarStrip
                events={calendarEvents}
                today={today}
                monthRange={CALENDAR_MONTH_RANGE}
                onCreateEvent={createEvent}
                onUpdateEvent={updateEvent}
                onDeleteEvent={deleteEvent}
                rows={flatEvents}
                onRefresh={loadEvents}
                openAddSignal={openAddSignal}
              />
            </RevealTile>
          </View>

          {/* Tab-bar clearance is the content container's paddingBottom now,
              so the tiles only carry their own spacing. */}
          <View style={styles.bento}>
            <View style={styles.bentoRow}>
              {/* Left: the tall block. Chores are the thing you act on, so they
                  get the most room — headline, the fraction as the value, and
                  an attribution row naming whose turn it is. */}
              <RevealTile delay={60} style={styles.bentoColLeft}>
                  <BentoCard
                    tone={CARD_TONES.lime}
                    height={BENTO_TALL}
                    onPress={() => navigation.navigate("House")}
                    styles={styles}
                  >
                    {(fg) => (
                      <>
                        <Pill
                          text={myChoreStats.total === 0 ? "Free" : choresLeft === 0 ? "Done" : "This week"}
                          fg={fg}
                          styles={styles}
                        />
                        <Text style={[styles.bentoTitle, { color: fg }]}>Chores</Text>
                        <Text style={[styles.bentoValue, { color: fg }]}>{choreStat}</Text>
                        <Text style={[styles.bentoLine, { color: withAlpha(fg, 0.7) }]}>{choreCaption}</Text>

                        <View style={styles.bentoSpacer} />

                        {/* The reference's trainer row: a face, a role, a name.
                            Here it's whose turn the next outstanding chore is. */}
                        {nextChore ? (
                          <View style={styles.attribution}>
                            <Avatar
                              member={nextChore.member}
                              size={FACE_LARGE}
                              fg={fg}
                              styles={styles}
                            />
                            <View style={styles.attributionText}>
                              <Text style={[styles.attributionRole, { color: withAlpha(fg, 0.65) }]}>
                                Up next
                              </Text>
                              <Text style={[styles.attributionName, { color: fg }]} numberOfLines={1}>
                                {nextChore.member.displayName.split(/\s+/)[0]} · {nextChore.chore.name}
                              </Text>
                            </View>
                          </View>
                        ) : (
                          <View style={styles.attribution}>
                            <View style={[styles.tickBadge, { backgroundColor: withAlpha(fg, 0.16) }]}>
                              <Ionicons name="checkmark" size={16} color={fg} />
                            </View>
                            <Text style={[styles.attributionName, { color: fg }]}>Nothing outstanding</Text>
                          </View>
                        )}
                      </>
                    )}
                  </BentoCard>
              </RevealTile>

              {/* Right: two shorter tiles. Bills is dark so the column reads as
                  a different weight from the block beside it. */}
              <View style={styles.bentoColRight}>
                <RevealTile delay={130}>
                  <BentoCard tone={CAL_PLATE} height={BENTO_TOP} styles={styles}>
                    {(fg) => (
                      <>
                        <View style={styles.bentoTopRow}>
                          <Pill text="Bills" fg={fg} styles={styles} />
                          <Ionicons name={billIcon as never} size={16} color={withAlpha(fg, 0.6)} />
                        </View>
                        <Text style={[styles.bentoValueSm, { color: fg }]}>{billStat}</Text>
                        <Text
                          style={[styles.bentoLine, { color: withAlpha(fg, 0.7) }]}
                          numberOfLines={2}
                        >
                          {billCaption}
                        </Text>
                      </>
                    )}
                  </BentoCard>
                </RevealTile>

                <RevealTile delay={200}>
                  <BentoCard
                    tone={CARD_TONES.indigo}
                    height={BENTO_BOTTOM}
                    onPress={() => navigation.navigate("Splitwise")}
                    styles={styles}
                  >
                    {(fg) => (
                      <>
                        <Pill
                          text={moneySummary.owe > 0 ? "You owe" : moneySummary.owed > 0 ? "Owed" : "Settled"}
                          fg={fg}
                          styles={styles}
                        />
                        {/* adjustsFontSizeToFit is the belt to the step-down's
                            braces: a four-figure balance still shrinks to the
                            line rather than truncating or wrapping. */}
                        <Text
                          style={[styles.bentoValueSm, { color: fg }]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.7}
                        >
                          {balanceStat}
                        </Text>
                        <Text
                          style={[styles.bentoLine, styles.bentoLineInset, { color: withAlpha(fg, 0.7) }]}
                          numberOfLines={1}
                        >
                          {balanceCaption}
                        </Text>
                      </>
                    )}
                  </BentoCard>
                </RevealTile>
              </View>
            </View>

            {/* Ruled off underneath, full width and short — the face pile is
                the information here, the count is the caption. */}
            <RevealTile delay={270}>
              <BentoCard
                tone={CARD_TONES.lilac}
                height={BENTO_WIDE}
                onPress={() => navigation.navigate("Shopping")}
                styles={styles}
              >
                {(fg) => (
                  <View style={styles.wideRow}>
                    <View style={styles.wideText}>
                      <Pill text="Shopping" fg={fg} styles={styles} />
                      <Text style={[styles.wideValue, { color: fg }]}>
                        {items.length}{" "}
                        <Text style={[styles.bentoLine, { color: withAlpha(fg, 0.7) }]}>
                          {shoppingCaption}
                        </Text>
                      </Text>
                    </View>

                    <View style={styles.facePile}>
                      {listFaces.faces.map((member, i) => (
                        <View
                          key={member.userId}
                          style={{ marginLeft: i === 0 ? 0 : -FACE_OVERLAP, zIndex: listFaces.faces.length - i }}
                        >
                          <Avatar member={member} size={FACE} fg={fg} styles={styles} />
                        </View>
                      ))}
                      {listFaces.extra > 0 && (
                        <View
                          style={[
                            styles.faceMore,
                            { marginLeft: -FACE_OVERLAP, backgroundColor: withAlpha(fg, 0.2) },
                          ]}
                        >
                          <Text style={[styles.faceMoreText, { color: fg }]}>+{listFaces.extra}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </BentoCard>
            </RevealTile>
          </View>
        </Animated.ScrollView>
      </View>
      <SettingsButton style={settingsReveal} pointerEvents={settingsLive ? "auto" : "none"} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  greeting: {
    fontFamily: fonts.regular,
    color: colors.text,
    fontSize: 26,
    letterSpacing: -0.7,
    lineHeight: 31,
    paddingRight: 36,
  },
  greetingLead: { fontFamily: fonts.regular, color: colors.textMuted },
  greetingName: { fontFamily: fonts.bold, color: colors.text },
  cursor: { fontFamily: fonts.bold, color: colors.accent, fontSize: 24, lineHeight: 30 },
  nudge: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 0.5,
    color: colors.accent,
    marginTop: 10,
  },
  // Carries the gap the removed "The Lowdown" heading used to provide, so the
  // tiles still read as their own section below the calendar. Kept tight: the
  // calendar is tall enough now that generous margins either side of it were
  // pushing the mosaic off the bottom of the screen. The tiles still read as
  // their own section — the calendar's dark plate is what separates them, not
  // the whitespace.
  calendarWrap: { marginTop: 10, marginBottom: 12 },
  // Tab-bar clearance is the ScrollView's job (useTabBarSpace); this is just
  // breathing room under the last tile.
  bento: { marginBottom: 12, gap: BENTO_GAP },
  bentoRow: { flexDirection: "row", gap: BENTO_GAP },
  // The tall tile is a shade wider than the pair beside it, which is what
  // stops the mosaic reading as two equal columns.
  bentoColLeft: { flex: 1.15 },
  bentoColRight: { flex: 1, gap: BENTO_GAP },

  // Shared shell. No border — the fill is the shape. The shadow is much
  // softer than the old stack's, which needed it to separate overlapping
  // layers; these tiles are separated by the gaps instead.
  bentoCard: {
    borderRadius: 24,
    padding: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  bentoTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  // Sits in the corner opposite the pill. Filled rather than outlined, so it
  // reads as a recess in the tile the way the pill does.
  bentoGo: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.6 },

  // The headline on the tall tile only. The shorter tiles lead with their
  // value instead — there isn't room for both, and the pill already names them.
  //
  // Every one of these carries an explicit lineHeight. Without it the line box
  // is whatever the font reports, which differs per family and per platform —
  // and these tiles are fixed-height, so an extra couple of points of leading
  // is the difference between fitting and spilling out the bottom.
  bentoTitle: { fontFamily: fonts.display, fontSize: 26, lineHeight: 31, letterSpacing: -0.6, marginTop: 10 },
  bentoValue: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.8, marginTop: 8 },
  // The compact tiles in the right column. A balance like "$1,234.56" is a lot
  // of glyphs for half the width, so the value steps down rather than the
  // caption below it getting pushed past the tile's edge.
  bentoValueSm: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, letterSpacing: -0.4, marginTop: 6 },
  bentoLine: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, marginTop: 3 },
  // Keeps the caption clear of the arrow badge in the bottom-right corner.
  bentoLineInset: { paddingRight: 30 },
  // Pushes the attribution row to the foot of the tall tile regardless of how
  // much copy sits above it.
  bentoSpacer: { flex: 1, minHeight: 8 },

  attribution: { flexDirection: "row", alignItems: "center", gap: 9 },
  attributionText: { flex: 1 },
  attributionRole: { fontFamily: fonts.regular, fontSize: 10, letterSpacing: 0.4 },
  attributionName: { fontFamily: fonts.bold, fontSize: 13, marginTop: 1 },
  tickBadge: { width: FACE_LARGE, height: FACE_LARGE, borderRadius: FACE_LARGE / 2, alignItems: "center", justifyContent: "center" },

  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.bold },

  wideRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  wideText: { flex: 1 },
  wideValue: { fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.5, marginTop: 6 },
  // Right-padded to clear the arrow badge in the corner.
  facePile: { flexDirection: "row", alignItems: "center", paddingRight: 30 },
  faceMore: { width: FACE, height: FACE, borderRadius: FACE / 2, alignItems: "center", justifyContent: "center" },
  faceMoreText: { fontFamily: fonts.bold, fontSize: 11 },
  });
}
