import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useTabBarSpace } from "../navigation/FlatTabBar";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import * as choresService from "../services/choresService";
import * as completionsService from "../services/completionsService";
import * as shoppingService from "../services/shoppingService";
import * as shoppingListService from "../services/shoppingListService";
import * as settlementsService from "../services/settlementsService";
import { assignChores, getPeriodIndex } from "../utils/rosterHelpers";
import { useTheme } from "../context/ThemeContext";
import { CARD_TONES, onColor, withAlpha, CAL_PLATE, CAL_RED } from "../theme/colors";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { useTabsHeaderSpace } from "../components/TabsHeader";
import RevealTile from "../components/RevealTile";
import AddEventModal from "../components/AddEventModal";
import { useRegisterAddAction } from "../navigation/AddActionContext";
import { computeNotifications, type NotifSummary } from "../storage/notificationSeen";
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
import type { Chore, Completion, ShoppingItem, ShoppingListItem, Balance, FlatEvent, NewFlatEvent } from "../types";
import ProfileAvatar from "../components/ProfileAvatar";

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

// How far ahead the bills card counts as "due". A fortnight covers the weekly
// and fortnightly cadences outright and catches a monthly bill with enough
// warning to do something about it.
const BILL_HORIZON_DAYS = 14;

type Nav = BottomTabNavigationProp<MainTabParamList>;
type Styles = ReturnType<typeof createStyles>;

const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// The device's own clock, not a country → timezone lookup: a phone's local
// time already reflects wherever the person actually is, which is what a
// live "good afternoon" greeting is answering to.
function periodForHour(hour: number) {
  if (hour < 5) return "evening";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
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

// The app wordmark top-left, a rotating one-line status ticker built from
// whatever actually needs attention, then a grid of tappable stat tiles —
// chores assigned to the signed-in user this week, their net balance, and
// the shopping list — each colour-coded and routing into the tab it
// summarises.
export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  // The tab bar floats over the page, so the last row needs
  // somewhere to scroll clear to. TabsHeader floats over the top the same
  // way, so the page needs matching clearance up there too.
  const tabBarSpace = useTabBarSpace();
  const headerSpace = useTabsHeaderSpace(0);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentUser, userFlat } = useAuth();

  const firstName = currentUser?.displayName?.trim().split(/\s+/)[0] ?? "";
  const greetingLead = `Good ${periodForHour(new Date().getHours())}`;

  // Refreshed on focus rather than memoised once, so the strip rolls over if
  // the app sits open past midnight.
  const [today, setToday] = useState(startOfToday);

  const [chores, setChores] = useState<Chore[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [flatEvents, setFlatEvents] = useState<FlatEvent[]>([]);
  // The flat's whole checklist (every list, not just whichever's active on
  // the Shopping tab) — only fetched here to feed the notification count,
  // never rendered directly.
  const [listItems, setListItems] = useState<ShoppingListItem[]>([]);
  const [notifSummary, setNotifSummary] = useState<NotifSummary>({ count: 0, latest: null });
  const [addEventVisible, setAddEventVisible] = useState(false);

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
    const [choresRes, completionsRes, itemsRes, balancesRes, listItemsRes] = await Promise.all([
      choresService.fetchChores(userFlat.id),
      completionsService.fetchCompletions(userFlat.id),
      shoppingService.fetchShoppingItems(userFlat.id),
      settlementsService.fetchBalances(userFlat.id),
      shoppingListService.fetchShoppingListItems(userFlat.id),
      // Kept out of the destructure: an older deployed API without /events
      // shouldn't blank the whole dashboard, so this one is allowed to fail.
      loadEvents().catch(() => {}),
    ]);
    setChores(choresRes.chores);
    setCompletions(completionsRes.completions);
    setItems(itemsRes.items);
    setBalances(balancesRes.balances);
    setListItems(listItemsRes.items);
  }, [userFlat, loadEvents]);

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

  useRegisterAddAction("Home", () => setAddEventVisible(true));

  const addEvent = async (event: NewFlatEvent) => {
    if (!userFlat) return;
    await eventsService.createEvent(userFlat.id, event);
    await loadEvents();
  };

  const updateEvent = async (eventId: string, event: NewFlatEvent) => {
    if (!userFlat) return;
    await eventsService.updateEvent(userFlat.id, eventId, event);
    await loadEvents();
  };

  const deleteEvent = async (eventId: string) => {
    if (!userFlat) return;
    await eventsService.deleteEvent(userFlat.id, eventId);
    await loadEvents();
  };

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

  // The two soonest things on the calendar box, birthdays included — same
  // "next up" reasoning as the bills card (`isStart` only, so a multi-day
  // event counts once, on the day it begins). Only the first two are ever
  // shown — the one coming up, and a line naming whatever's after it.
  const upcomingEvents = useMemo(() => {
    const todayISO = toISODate(today);
    return calendarEvents
      .filter((event) => event.isStart && event.date >= todayISO)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
      .slice(0, 2);
  }, [calendarEvents, today]);

  // "Notifications" here aren't a stored inbox — they're the things that
  // have actually changed since this flatmate last opened the tab that owns
  // them: a chore added/edited/ticked, a flatmate's new item on the shared
  // list, or a new bill. See storage/notificationSeen for what "seen" means
  // per category. Recomputed whenever any of those sources changes, so
  // marking something seen elsewhere (e.g. opening the House tab) is
  // reflected the next time this screen focuses and reloads its data.
  useFocusEffect(
    useCallback(() => {
      if (!userFlat || !currentUser) return;
      let cancelled = false;
      computeNotifications(userFlat.id, currentUser.id, {
        chores,
        completions,
        shoppingItems: listItems,
        billItems: items,
      }).then((summary) => {
        if (!cancelled) setNotifSummary(summary);
      });
      return () => {
        cancelled = true;
      };
    }, [userFlat, currentUser, chores, completions, listItems, items]),
  );

  if (!userFlat || !currentUser) return null;

  const notifCount = notifSummary.count;
  const hubTarget = notifSummary.latest?.target ?? "House";
  const hubLabel = notifSummary.latest?.label ?? "Flat Hub";

  const dateDay = today.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const dateWeekday = today.toLocaleDateString(undefined, { weekday: "long" });

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
      <View style={[styles.container, { paddingTop: headerSpace }]}>
        <View style={{ flex: 1, paddingBottom: tabBarSpace + 4 }}>
          <RevealTile delay={0}>
            <View style={styles.greetSection}>
              {/* The date sits on the plain page, clear of the disc below. */}
              <View style={styles.greetDateRow}>
                <View style={styles.greetDateBlock}>
                  <Text style={styles.greetDateDay}>{dateDay}</Text>
                  <Text style={styles.greetDateWeekday}>{dateWeekday}</Text>
                </View>
              </View>

              <View style={styles.greetBlobWrap}>
                <View style={styles.greetBlob} />
                <View style={styles.greetTextBlock}>
                  <Text style={styles.greetTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {greetingLead}, {firstName}
                  </Text>
                  <Text style={styles.greetSubtitle} numberOfLines={1}>
                    Welcome to {userFlat.name}
                  </Text>
                </View>
              </View>

              <View style={styles.greetFooter}>
                <View style={styles.greetNotifRow}>
                  {notifCount > 0 && <View style={styles.greetDot} />}
                  <Text style={styles.greetNotifText} numberOfLines={1}>
                    {notifCount > 0
                      ? `${notifCount} new notification${notifCount === 1 ? "" : "s"}`
                      : "All caught up"}
                  </Text>
                </View>
                {notifCount > 0 && (
                  <Pressable
                    style={styles.greetHubRow}
                    onPress={() => navigation.navigate(hubTarget)}
                    hitSlop={8}
                  >
                    <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
                    <Text style={styles.greetHubText}>{hubLabel}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </RevealTile>

          {/* The calendar box — fills whatever's left between the greeting
              and the mosaic. `flex: 1` on a fixed-height parent is what
              makes it soak up the slack, so the tiles below always land
              right above the tab bar's "+" rather than floating mid-screen. */}
          <View style={styles.calendarBox}>
            <View style={styles.calendarBoxHeader}>
              <Text style={styles.calendarBoxHeading}>Coming Up</Text>
              <View style={styles.calendarBoxHeadingRule} />
            </View>

            {upcomingEvents.length === 0 ? (
              <View style={styles.calendarBoxMain}>
                <Text style={styles.calendarBoxEmpty}>No events coming up</Text>
              </View>
            ) : (
              <>
                {/* The one coming up — the box's whole reason for being, so it
                    gets the room: large, centred in whatever space the header
                    and the "next" line leave it. Name and date share the one
                    row, name on the left and the date over on the right. */}
                <View style={styles.calendarBoxMain}>
                  <View style={styles.calendarBoxMainRow}>
                    <Text
                      style={styles.calendarBoxMainTitle}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      {upcomingEvents[0].title}
                    </Text>
                    <Text style={styles.calendarBoxMainDate} numberOfLines={1}>
                      {(fromISODate(upcomingEvents[0].date) ?? today).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })}
                    </Text>
                  </View>
                </View>

                {/* Whatever's after that — a short rule and a quiet line,
                    rather than a second headline competing with the first. */}
                {upcomingEvents[1] && (
                  <View style={styles.calendarBoxNextBlock}>
                    <View style={styles.calendarBoxNextRule} />
                    <View style={styles.calendarBoxNextRow}>
                      <Text style={styles.calendarBoxNextLabel}>Next</Text>
                      <Text style={styles.calendarBoxNextText} numberOfLines={1}>
                        {upcomingEvents[1].title} ·{" "}
                        {(fromISODate(upcomingEvents[1].date) ?? today).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                        })}
                      </Text>
                    </View>
                  </View>
                )}
              </>
            )}
          </View>

          <Text style={styles.flatHeader} numberOfLines={1}>
            {userFlat.name}
          </Text>

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
                        <Text style={[styles.bentoLine, { color: withAlpha(fg, 0.7) }]} numberOfLines={2}>
                          {choreCaption}
                        </Text>

                        <View style={styles.bentoSpacer} />

                        {/* The reference's trainer row: a face, a role, a name.
                            Here it's whose turn the next outstanding chore is. */}
                        {nextChore ? (
                          <View style={styles.attribution}>
                            <Avatar
                              member={nextChore.member}
                              size={FACE_LARGE}
                              fg={fg}
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
                            <Text
                              style={[styles.attributionName, styles.attributionSolo, { color: fg }]}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.85}
                            >
                              Nothing outstanding
                            </Text>
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
                          <Pill text="Due soon" fg={fg} styles={styles} />
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
                    onPress={() => navigation.navigate("Bills")}
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
                          <Avatar member={member} size={FACE} fg={fg} />
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
        </View>
      </View>

      <AddEventModal
        visible={addEventVisible}
        onClose={() => setAddEventVisible(false)}
        onSubmit={addEvent}
        events={flatEvents}
        onUpdate={updateEvent}
        onDelete={deleteEvent}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 10 },
  // Sits directly on the page — no card fill of its own. A small lime disc
  // sits just inside the left edge, centred on the greeting line; the date
  // and the footer row live on the plain background above and below it, each
  // with its own margin so nothing bleeds into the wordmark above or the
  // tiles below.
  // 8pt between every major block down the screen — this gap, the footer's
  // own marginBottom, the filler panel's, and the flat header's are all the
  // same value, so the wordmark, the greeting, the purple panel, and the flat
  // label read as one evenly-paced stack rather than ad-hoc gaps.
  greetSection: { marginTop: 8, marginBottom: 0 },
  greetDateRow: { flexDirection: "row", justifyContent: "flex-end", paddingTop: 4 },
  greetDateBlock: { alignItems: "flex-end" },
  // Both lines the same size — it's "day + weekday" as one two-line date, not
  // a headline over a caption — with just enough of a colour split to keep
  // the day the one that reads first.
  greetDateDay: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 18, color: colors.text },
  greetDateWeekday: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 18, color: colors.textMuted },
  // Fixed to the disc's own diameter, so the wrap's footprint is exactly the
  // disc — nothing above (the date row) or below (the footer) collides with
  // it, and the greeting text is centred in the same box the disc is.
  // Trimmed to the disc's own extent (10pt top offset + 130pt diameter) so
  // the wrap doesn't carry dead space below the circle before the footer.
  greetBlobWrap: { height: 140, marginTop: -50, marginBottom: 0 },
  greetBlob: {
    position: "absolute",
    top: 10,
    // Bleeds past the container's own 20pt inset on purpose — cropped by the
    // screen edge the way it is in the reference, not floating inside it.
    left: 0,
    width: 130,
    height: 130,
    borderRadius: 75,
    backgroundColor: CARD_TONES.lime,
  },
  // Same `top` as the disc above, rather than letting the wrap centre it —
  // that's what keeps the greeting's own top edge level with the disc's.
  // Clears the disc and shifts the whole block a touch right of the page
  // edge, while staying well inside the disc's own span.
  greetTextBlock: { paddingLeft: 30, paddingTop: 45 },
  greetTitle: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: -0.4, color: colors.text },
  // A dark olive rather than the theme's muted grey — the subtitle wants to
  // read as printed on the lime disc, not as secondary page text.
  greetSubtitle: { fontFamily: fonts.regular, fontSize: 20, color: colors.text, marginTop: 2 },
  // One connected group on the right now — dot, notification count, and the
  // Flat Hub link all read as a single line rather than two ends of a row.
  greetFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 0,
    marginBottom: 8,
  },
  greetNotifRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, marginRight: 10 },
  greetDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: CAL_RED },
  greetNotifText: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  greetHubRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  greetHubText: { fontFamily: fonts.bold, fontSize: 13, color: colors.textMuted },
  // The calendar box — a pinky-purple panel between the greeting and the
  // mosaic. `flex: 1` inside the screen's own flex column is what lets it
  // grow or shrink with whatever room is left, rather than a fixed guess at
  // the gap's size.
  calendarBox: {
    flex: 1,
    marginTop: 0,
    marginBottom: 8,
    borderRadius: 24,
    backgroundColor: CARD_TONES.lilac,
    padding: 16,
  },
  // "Coming Up" sits top-left, with a short rule underneath it rather than
  // spanning the whole box — it reads as a label for the box, not a divider
  // across it.
  calendarBoxHeader: { alignItems: "flex-start" },
  calendarBoxHeading: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 0.3,
    color: colors.text,
  },
  calendarBoxHeadingRule: {
    marginTop: 5,
    width: 60,
    height: 1,
    backgroundColor: withAlpha(colors.text, 0.25),
  },
  // The one event coming up — the box's main event, so it fills whatever
  // room the header and the "next" line leave it rather than sharing space
  // with a list. Centred vertically, so the pair sits in the middle of the
  // box rather than pinned to the header.
  calendarBoxMain: { flex: 1, justifyContent: "center" },
  // Name and date share the one row — name takes whatever room the date
  // doesn't need, date sits flush against the box's right edge.
  calendarBoxMainRow: { flexDirection: "row", alignItems: "baseline", gap: 25 },
  calendarBoxMainTitle: {
    marginTop: 15,
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.6,
    color: colors.text,
  },
  calendarBoxMainDate: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: withAlpha(colors.text, 0.65),
  },
  calendarBoxEmpty: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: withAlpha(colors.text, 0.6),
  },
  // Whatever's after the main event — a short rule and a quiet line, not a
  // second headline. Pushed down clear of the main row rather than sitting
  // snug under it, so it reads as a footer to the box rather than a second
  // line of it.
  calendarBoxNextBlock: { marginTop: 10},
  // A short rule rather than a full-width one — the same treatment as the
  // "Coming Up" heading's own rule, so the two read as a matched pair.
  calendarBoxNextRule: {
    width: 30,
    height: 1,
    backgroundColor: withAlpha(colors.text, 0.25),
    marginBottom: 4,
  },
  calendarBoxNextRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 25,
  },
  calendarBoxNextLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: withAlpha(colors.text, 0.55),
  },
  calendarBoxNextText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: withAlpha(colors.text, 0.8),
  },
  // Small section label introducing the mosaic below — the flat's own name,
  // so the tiles read as "this flat's chores/balance/list" rather than
  // floating unlabelled under the purple panel.
  flatHeader: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 0.3,
    color: colors.textMuted,
    marginBottom: 8,
  },
  nudge: {
    fontFamily: fonts.bold,
    fontSize: 20,
    letterSpacing: 0.5,
    color: colors.accent,
    marginTop: 10,
  },
  // Tab-bar clearance is the ScrollView's job (useTabBarSpace); this is just
  // breathing room under the last tile.
  bento: { marginBottom: 4, gap: BENTO_GAP },
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

  // Right-padded to clear the arrow badge: the badge is 26pt wide sitting 12pt
  // from the card's edge, and the card pads 14, so it reaches 24pt into the
  // content box — the row has to stop short of that or the name runs under it.
  attribution: { flexDirection: "row", alignItems: "center", gap: 9, paddingRight: 30 },
  attributionText: { flex: 1, minWidth: 0 },
  attributionRole: { fontFamily: fonts.regular, fontSize: 10, letterSpacing: 0.4 },
  attributionName: { fontFamily: fonts.bold, fontSize: 13, marginTop: 1 },
  // A Text sitting straight in the row rather than inside attributionText
  // needs its own flex, or RN lets it run full width past the padding.
  attributionSolo: { flex: 1, minWidth: 0 },
  tickBadge: { width: FACE_LARGE, height: FACE_LARGE, borderRadius: FACE_LARGE / 2, alignItems: "center", justifyContent: "center" },


  wideRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  wideText: { flex: 1 },
  wideValue: { fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.5, marginTop: 6 },
  // Right-padded to clear the arrow badge in the corner.
  facePile: { flexDirection: "row", alignItems: "center", paddingRight: 30 },
  faceMore: { width: FACE, height: FACE, borderRadius: FACE / 2, alignItems: "center", justifyContent: "center" },
  faceMoreText: { fontFamily: fonts.bold, fontSize: 11 },
  });
}
