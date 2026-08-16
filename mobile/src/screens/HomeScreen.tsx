import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBarSpace } from "../navigation/FlatTabBar";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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

// Full height of each stacked card, and how much of it stays visible once the
// next card overlaps it. The exposed band is what carries that card's
// information, so it has to fit label + stat + caption.
// EXPOSED_HEIGHT has to clear padding + icon row + stat + caption (~85pt) or
// the covered cards lose their caption to the overlap.
const CARD_HEIGHT = 116;
const EXPOSED_HEIGHT = 90;
// Matched to the tick box on the roster's chore cards (HouseScreen's
// `checkbox`) — same square, same 3pt border, same radius. Kept in step by
// hand: the two screens have separate stylesheets, so a change to one is a
// change to make in both.
const GO_BOX = 24;

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

// One layer of the stack. A covered card is CARD_HEIGHT tall and pulled up
// over the one before, so only EXPOSED_HEIGHT of it shows — enough for the
// label, stat and caption. The last card is cut to EXPOSED_HEIGHT outright,
// since it has nothing sitting on top of it to hide the difference; every
// layer in the stack therefore shows a band of exactly the same depth.
function StackCard({
  index,
  icon,
  label,
  stat,
  caption,
  tone,
  last,
  onPress,
  styles,
}: {
  index: number;
  icon: (color: string) => React.ReactNode;
  label: string;
  stat: string;
  caption: string;
  // The metric's colour, filling the whole card. Everything printed on it
  // takes whichever of black/white contrasts better, so the tone is free to
  // be as light or dark as it likes without the text going unreadable.
  tone: string;
  // Nothing overlaps the last card, so its extra height is dead space at the
  // bottom rather than the covered band the others give up. It's cut down to
  // the exposed height instead — which also puts the arrow, fixed at the
  // centre of that band, in the middle of this card rather than above it.
  last?: boolean;
  // Optional: the bills card is read off the calendar sitting directly above
  // it on this same screen, so there is nowhere for it to send you. It loses
  // the arrow with the press rather than pointing at nothing.
  onPress?: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const fg = onColor(tone);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.stackCard,
        {
          backgroundColor: tone,
          height: last ? EXPOSED_HEIGHT : CARD_HEIGHT,
          // First card sits flush; the rest overlap the card above.
          marginTop: index === 0 ? 0 : EXPOSED_HEIGHT - CARD_HEIGHT,
          // Later siblings already paint on top on iOS; this makes the order
          // explicit and holds on Android too.
          zIndex: index,
        },
      ]}
    >
      <View style={styles.stackHeader}>
        {/* The chip is the foreground colour faded back, so it reads as a
            recess in the block rather than a second colour on top of it. */}
        <View style={[styles.stackIcon, { backgroundColor: withAlpha(fg, 0.18) }]}>{icon(fg)}</View>
        <Text style={[styles.stackLabel, { color: fg }]}>{label}</Text>
      </View>
      <Text style={[styles.stackStat, { color: fg }]}>{stat}</Text>
      <Text style={[styles.stackCaption, { color: withAlpha(fg, 0.72) }]}>{caption}</Text>

      {/* The same box the chore cards carry, with an arrow where their tick
          goes: this one completes nothing, it opens the tab the card is
          summarising. Deliberately not a Pressable of its own — the whole card
          already navigates there, and a second target would only give the same
          journey two hit areas. */}
      {onPress && (
        <View style={[styles.stackGo, { borderColor: fg }]}>
          <Ionicons name="arrow-forward" size={14} color={fg} />
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
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <View onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}>
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

          <View style={[styles.stack, { marginBottom: tabBarSpace + 12 }]}>
            <StackCard
              index={0}
              icon={(color) => <Ionicons name={billIcon as never} size={15} color={color} />}
              label="Bills due"
              stat={billStat}
              caption={billCaption}
              tone={CAL_PLATE}
              styles={styles}
            />
            <StackCard
              index={1}
              icon={(color) => <MaterialCommunityIcons name="broom" size={15} color={color} />}
              label="Chores"
              stat={choreStat}
              caption={choreCaption}
              tone={CARD_TONES.lime}
              onPress={() => navigation.navigate("House")}
              styles={styles}
            />
            <StackCard
              index={2}
              icon={(color) => <Ionicons name="cash-outline" size={15} color={color} />}
              label="Balance"
              stat={balanceStat}
              caption={balanceCaption}
              tone={CARD_TONES.indigo}
              onPress={() => navigation.navigate("Splitwise")}
              styles={styles}
            />
            <StackCard
              index={3}
              icon={(color) => <Ionicons name="cart-outline" size={15} color={color} />}
              label="Shopping list"
              stat={String(items.length)}
              caption={shoppingCaption}
              tone={CARD_TONES.lilac}
              last
              onPress={() => navigation.navigate("Shopping")}
              styles={styles}
            />
          </View>
        </View>

        <Animated.ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: tabBarSpace, minHeight: viewportHeight + SETTINGS_REVEAL }}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {/* A spacer to give the page scroll range so the settings button can reveal */}
          <View style={{ height: viewportHeight / 2 }} />
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
    fontSize: 28,
    letterSpacing: -0.7,
    lineHeight: 34,
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
  // tiles still read as their own section below the calendar.
  calendarWrap: { marginTop: 28, marginBottom: 26 },
  // Tab-bar clearance is the ScrollView's job now (useTabBarSpace); this is
  // just breathing room under the last card.
  stack: { marginBottom: 12 },
  // The fill is the metric's own colour, set per card. No outline: the block
  // is the colour now, and the shadow alone separates the overlapping layers.
  // Height is set per card — the last one is cut to EXPOSED_HEIGHT.
  stackCard: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    alignItems: "flex-start",
    // Lifts each layer off the one it covers so the overlap reads as depth
    // rather than as one flat shape.
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 6,
  },
  stackHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  stackIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  stackLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase" },
  // Centred in the band that stays visible under the next card's overlap
  // rather than in the card's full height, so all three sit at the same height
  // down the stack instead of the bottom one dropping below its neighbours.
  // Border colour comes from the card's contrast-picked foreground.
  stackGo: {
    position: "absolute",
    right: 16,
    top: (EXPOSED_HEIGHT - GO_BOX) / 2,
    width: GO_BOX,
    height: GO_BOX,
    borderWidth: 3,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  stackStat: { fontFamily: fonts.display, fontSize: 22, marginTop: 3 },
  // Colour is set per card from the contrast-picked foreground, faded back.
  stackCaption: { fontFamily: fonts.regular, fontSize: 11, marginTop: 1 },
  });
}
