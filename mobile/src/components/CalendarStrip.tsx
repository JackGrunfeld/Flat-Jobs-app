import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  LayoutChangeEvent,
  PanResponder,
  Animated,
  Pressable,
  TextInput,
  Platform,
  Modal,
  ActivityIndicator,
  Alert,
  ScrollView,
  Easing,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { withAlpha, CAL_RED } from "../theme/colors";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import type { CalendarEvent, EventCategory, EventRecurrence, NewFlatEvent, FlatEvent } from "../types";
import {
  CATEGORY_ORDER,
  EVENT_CATEGORIES,
  RECURRENCE_LABELS,
  RECURRENCE_ORDER,
  recurrenceCaption,
} from "../theme/eventCategories";
import {
  WEEKDAY_INITIALS,
  addDays,
  addMonths,
  daysInMonth,
  formatTime,
  groupEventsByDate,
  monthLabel,
  nextEvent,
  relativeDayLabel,
  toISODate,
  fromISODate,
  weekdayLabel,
} from "../utils/calendarEvents";
import AnimatedAddAction from "./AnimatedAddAction";

// The month runs seven to a row from the 1st, under a header of weekday
// initials — which holds because seven columns means every cell in a column
// shares a weekday. Fixed at seven for that reason: the columns can't be sized
// to fit as many as the width allows the way a plain flow of days could be.
const COLUMNS = 7;
// Each column is a flex cell, so the row always spans the track exactly; the
// circle inside is sized off the measured width and clamped at both ends.
// MAX_CIRCLE is the one that shapes the card: five or six rows of it, plus
// ROW_GAP between them and the weekday header on top, is the widget's whole
// depth. It's set near what a phone's width can actually give a column, so the
// month fills the card rather than sitting as a strip in the top of it — the
// card is meant to read as a page of the calendar, not a summary of one.
const CELL_GAP = 4;
// Split out from CELL_GAP, which only ever meant horizontal breathing room in
// the circle sizing above. This is the air between one week's circles and the
// next's — multiplied by five or six rows, it's the cheapest depth on the card.
const ROW_GAP = 6;
const MIN_CIRCLE = 24;
const MAX_CIRCLE = 34;
// How much taller the card stands while a day's events are being listed. The
// list is what the card is for in that state, so it gets the grid's height and
// then some — the month underneath isn't being read at the time.
const VIEW_EXTRA_HEIGHT = 72;
// Fixed rather than content-sized on purpose: the block's width feeds the
// track's width, which decides the row height, which is what sizes this
// block's letters. Letting it size to its own text would close that loop and
// let the layout oscillate. It doubles as the ceiling on letter size — a glyph
// can't be wider than the column it stacks in.
const DATE_BLOCK_WIDTH = 96;
// Held clear at the block's left edge for the date (or the year, off-month),
// which sits in the corner beside the first letter. The stack takes the rest
// and is pushed right against the grid, so this is what sets the gap between
// the corner and the letters: widen it and they drift right, away from the
// date. The four digits of a year are what it has to be wide enough for, not
// the two of a date — hence the smaller size on that one.
const CORNER_SPACE = 28;
const DATE_NUM_SIZE = 22;
const YEAR_SIZE = 11;
// DM Sans Black, as fractions of the font size: how tall a capital actually
// stands, and how wide the widest capital a short month can throw at us ("M")
// runs. Letters are sized by cap height rather than by font size because an em
// box is mostly invisible ascent and descent — sizing by it left the caps
// floating in a third of the space they'd been given.
const CAP_RATIO = 0.7;
const ASCENT_RATIO = 1;
const WIDEST_GLYPH = 0.92;
// How much of its slice of the block a capital fills. The remainder is the gap
// between one letter and the next, so raising this is what closes the stack up.
// Pushed high enough that on a five-row month the width cap below is what
// actually settles the size — which is the ceiling that stops the letters
// running into each other however tall the grid comes out.
const CAP_FILL = 0.88;
// Stretched horizontally past its natural proportions — the block is a fixed
// column and the letters are meant to fill its width, which at this size they
// otherwise wouldn't. Dial for how wide the stack reads.
const STRETCH = 1.15;
// Nothing here sets `lineHeight`. A line box tighter than the font's own
// metrics is what crops the tops off capitals, and a looser one leaves the
// glyph sitting wherever the platform decides to put the slack — neither is
// something to build an alignment on. Every line keeps its natural box and is
// pulled up by (ascent - cap) instead, which lands the top of the capital on
// the top of its row. Both the stack and the date in the corner are pulled by
// that same ratio of their own size, so their capitals line up on one edge
// whatever DM Sans' true metrics turn out to be.
const capLeadFor = (size: number) => size * (ASCENT_RATIO - CAP_RATIO);

// How far a vertical drag carries the cube through a full quarter turn, and
// how far it has to move before the card claims the gesture from the page's
// ScrollView at all. Past half a turn on release the month commits; short of
// it the cube falls back square — or a hard enough flick commits either way.
const SWIPE_TRAVEL = 130;
const CLAIM_THRESHOLD = 14;
const FLICK_VELOCITY = 0.55;
// What's left of the drag once there's no month that way to turn to.
const EDGE_RESISTANCE = 0.12;
// Viewing distance for the cube, in px. Lower is a wider lens: the turn gets
// more dramatic, and the far edge of a face shrinks harder as it goes back.
const CUBE_PERSPECTIVE = 700;
// How much light a face loses at its most side-on. The faces are lit from the
// front, so turning away from the viewer has to cost light or the cube reads
// flat. Spent as opacity on the face's own contents rather than as a black
// wash over its rectangle: the faces have no fill of their own, so a wash
// darkened the card's plate along with them and the turn read as a shadow
// sweeping the panel instead of as the letters and days themselves rolling.
const CUBE_SHADE = 0.62;
// A quarter turn's worth of sample points. Animated can only interpolate
// piecewise-linearly, and sine and cosine are what the geometry is made of —
// enough samples that the straight segments between them don't show.
const TURN_SAMPLES = Array.from({ length: 13 }, (_, i) => -1 + i / 6);
const sampleTurn = (fn: (progress: number) => number) => TURN_SAMPLES.map(fn);
// Progress through the turn as an angle: ±1 is the quarter turn that brings
// the next face square on.
const turnAngle = (progress: number) => (progress * Math.PI) / 2;
// A face's own scale once it's `depth` px behind the screen plane. RN has no
// translateZ, so the depth a cube face picks up as it swings back is drawn as
// the shrink that depth would cause instead.
const depthScale = (depth: number) => CUBE_PERSPECTIVE / (CUBE_PERSPECTIVE + depth);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Rows of seven starting on the 1st — no leading blanks, so the month always
// begins hard against the left edge and every row runs a full week across.
// Only the last row can come up short. Explicit rows rather than a wrapping
// flow: a flow only lines its columns up while every cell is the same width,
// and rounding on a fractional width is enough to break that.
//
// Seven days to a row also means a column still holds one weekday all the way
// down — it just starts on whatever day the 1st fell on rather than on Sunday,
// so the header rotates to follow the month instead of the month being pushed
// across to meet a fixed header.
function buildMonth(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => new Date(year, month, i + 1));

  const cells: (Date | null)[] = [...days];
  while (cells.length % COLUMNS !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += COLUMNS) weeks.push(cells.slice(i, i + COLUMNS));

  const firstWeekday = days[0].getDay();
  const columnWeekdays = Array.from({ length: COLUMNS }, (_, i) => (firstWeekday + i) % 7);

  // Split by code point rather than by index, so a locale whose short month
  // isn't three Latin letters still stacks a character at a time.
  return { weeks, columnWeekdays, letters: [...monthLabel(monthDate)] };
}

// The card keeps its own near-black, blue-cast plate in both schemes — the
// same shade the tab bar uses — rather than taking the theme's surface, so the
// calendar reads as one dark panel on the dashboard whichever way the
// appearance toggle is set. Everything drawn on it therefore needs its own
// on-dark values below rather than the theme's scheme-dependent ones.
const CAL_DARK = "#1b1f2a";
const CAL_FIELD = "#252b3a";
const ON_DARK = "#ffffff";
const ON_DARK_MUTED = "rgba(255, 255, 255, 0.55)";
// Days already gone still read as white, just dimmed — the month has to stay
// scannable in both directions now that nothing else marks the passage of it.
const ON_DARK_PAST = "rgba(255, 255, 255, 0.35)";
const ON_DARK_LINE = "rgba(255, 255, 255, 0.12)";
// Today's date, the month, and today's letter in the weekday header.
// (CAL_RED is defined in theme/colors.ts alongside CAL_PLATE.)
// An event whose owner never picked a colour still has to read as "something's
// on", so it rings in plain white rather than in nothing at all.
const NEUTRAL_RING = "rgba(255, 255, 255, 0.5)";

type Props = {
  events: CalendarEvent[];
  // Injectable so the caller controls "now" (and so this is testable) — the
  // strip itself never reads the clock.
  today: Date;
  // Months either side of today that can be swiped to. Matches the window the
  // caller built `events` over — swiping past it would show months whose rings
  // are missing only because the data stops, which would read as a bug.
  monthRange: number;
  // Persists the event and refreshes `events`. Rejecting surfaces inline in
  // the form and keeps the draft, so a failed save isn't retyped.
  onCreateEvent: (input: NewFlatEvent) => Promise<void>;
  onUpdateEvent?: (id: string, input: NewFlatEvent) => Promise<void>;
  onDeleteEvent?: (id: string) => Promise<void>;
  rows?: FlatEvent[];
  // Increment this value to programmatically open the add form.
  openAddSignal?: number;
  // Optional callback to refresh server-backed rows (passed from HomeScreen)
  onRefresh?: () => Promise<void>;
};

// Local HH:MM off a Date the picker handed back — the stored value is
// wall-clock, so no UTC conversion may happen on the way in.
const toHHMM = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const formatDateLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

// Compact month view for the top of the home screen: today's date and month
// on the left, the whole current month as weeks under a weekday header on the
// right, then whatever's next on the calendar in a second box below it. Bare
// days carry
// nothing but their number — only a day with something on it gets a ring, in
// the colour of the flatmate whose event it is. Today is picked out in red
// rather than by a circle, so a ring always means an event and never anything
// else.
export default function CalendarStrip({ events, today, monthRange, onCreateEvent, onUpdateEvent, onDeleteEvent, rows, openAddSignal, onRefresh }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // The card is either the calendar or the add form — never both. Swapping in
  // place is what the "+" turns the widget into.
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDate, setDraftDate] = useState(today);
  const [draftTime, setDraftTime] = useState<Date | null>(null);
  // Null until the event is made to span: the end date field only appears once
  // there's an end to show, so the common one-day case stays a one-line form.
  const [draftEnd, setDraftEnd] = useState<Date | null>(null);
  const [draftRepeat, setDraftRepeat] = useState<EventRecurrence | null>(null);
  const [draftCategory, setDraftCategory] = useState<EventCategory | null>(null);
  // Which of the three date/time pickers is open, if any — they share one
  // sheet on iOS, so this can't be three independent booleans.
  const [picker, setPicker] = useState<"date" | "end" | "time" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Months away from today. Reset whenever `today` changes — the caller hands
  // a fresh date on every screen focus, so coming back to the tab lands on the
  // current month rather than wherever the last swipe left off.
  const [monthOffset, setMonthOffset] = useState(0);
  useEffect(() => setMonthOffset(0), [today]);

  // Two measurements drive the layout: the track's width sizes the day
  // circles, and the height the weeks come out to is what the date block on
  // the left then matches.
  const [trackWidth, setTrackWidth] = useState(0);
  const [gridHeight, setGridHeight] = useState(0);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setTrackWidth(width);
    if (!viewMode) {
      setGridHeight(height);
    }
  };

  const stableGridHeight = gridHeight > 0 ? gridHeight : 220;
  // The day list doesn't have to stop where the month grid did — nothing is
  // being laid over the grid, the card simply grows for as long as the list is
  // up. Worth roughly two more events on screen before anything has to be
  // scrolled for, which is most days.
  const viewListHeight = (gridHeight > 0 ? gridHeight : 220) + VIEW_EXTRA_HEIGHT;
  const circle =
    trackWidth > 0
      ? Math.min(MAX_CIRCLE, Math.max(MIN_CIRCLE, trackWidth / COLUMNS - CELL_GAP))
      : MIN_CIRCLE;
  const dayNumSize = Math.round(Math.min(18, Math.max(12, circle * 0.44)));

  const viewedMonth = useMemo(() => addMonths(today, monthOffset), [today, monthOffset]);
  const isCurrentMonth = monthOffset === 0;

  const liveMonth = useMemo(() => buildMonth(viewedMonth), [viewedMonth]);

  // How far through the turn to the next month the cube is, signed: +1 is the
  // month after `viewedMonth` fully in place, -1 the month before, 0 square on.
  // The drag writes straight into it, so a half-finished swipe is a
  // half-turned cube that stays there for as long as the finger does.
  const turn = useRef(new Animated.Value(0)).current;
  // Which neighbour is mounted as the second face. 0 mounts nothing: two full
  // grids only exist while a turn is actually in progress.
  const [turnDir, setTurnDir] = useState(0);
  const turnDirRef = useRef(0);
  // The one commit between a turn finishing and the cube being squared back up.
  // Both faces show the landed month for it — see the note on the effect below.
  const [settling, setSettling] = useState(false);
  const [settlingMonth, setSettlingMonth] = useState<Date | null>(null);
  const displayedMonth = settling ? (settlingMonth ?? viewedMonth) : viewedMonth;
  const incomingMonth = useMemo(() => {
    if (settling) return settlingMonth ?? displayedMonth;
    return turnDir !== 0 ? addMonths(today, monthOffset + turnDir) : displayedMonth;
  }, [settling, settlingMonth, displayedMonth, today, monthOffset, turnDir]);
  // The responder is memoised and must not be rebuilt mid-gesture, so
  // everything it reads that changes goes through a ref.
  const offsetRef = useRef(monthOffset);
  offsetRef.current = monthOffset;
  // View mode replaces the grid with a vertically scrolling day list, and both
  // gestures are the same drag — the month swipe has to stand down there or a
  // scroll through a long day flicks the calendar into another month.
  const viewModeRef = useRef(false);

  const step = (delta: number) => {
    setMonthOffset((current) => {
      const next = current + delta;
      if (next < -monthRange || next > monthRange) return current;
      return next;
    });
  };

  // Abandons a turn that never committed. The cube has already been sprung
  // back to square by the time this runs, so this is really just unmounting
  // the second face.
  const endTurn = () => {
    turn.setValue(0);
    turnDirRef.current = 0;
    setTurnDir(0);
  };

  // Squaring the cube back up after a committed turn can't be made to land in
  // the same frame as the month it belongs to: `turn.setValue` writes straight
  // to the native node, while swapping the month is a React render, and the two
  // are different clocks. Whichever lands first is a frame of a month square-on
  // in the wrong place — the outgoing one if the reset wins, the one after the
  // target if the render does.
  //
  // So the swap doesn't try to be atomic. For the one commit it takes, *both*
  // faces render the month just landed on: the front face because `monthOffset`
  // has moved, the incoming face because `settling` pins it there instead of to
  // its neighbour. Whatever order the two clocks fire in, every frame in the
  // gap shows the same month, and squaring up changes nothing visible.
  useLayoutEffect(() => {
    if (!settling) return;
    turn.setValue(0);
    turnDirRef.current = 0;
    setTurnDir(0);
    setSettling(false);
    setSettlingMonth(null);
  }, [settling, turn]);

  const panResponder = useMemo(() => {
    // No month that way: the cube still gives under the finger, just barely,
    // so the edge of the range reads as an edge rather than as a dead widget.
    const atEdge = (dir: number) => {
      const next = offsetRef.current + dir;
      return next < -monthRange || next > monthRange;
    };

    const progressFor = (dy: number) => {
      const raw = clamp(-dy / SWIPE_TRAVEL, -1, 1);
      const dir = raw > 0 ? 1 : raw < 0 ? -1 : 0;
      return { dir, progress: dir !== 0 && atEdge(dir) ? raw * EDGE_RESISTANCE : raw };
    };

    return PanResponder.create({
      // Only claims clearly-vertical drags, and only past a threshold — a
      // tap or a diagonal flick still belongs to the ScrollView underneath.
      onMoveShouldSetPanResponder: (_, gesture) =>
        !viewModeRef.current &&
        Math.abs(gesture.dy) > CLAIM_THRESHOLD &&
        Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        const { dir, progress } = progressFor(gesture.dy);
        // Mounting the incoming face is a state change, so it happens once
        // when the drag picks a direction rather than on every frame.
        if (dir !== 0 && dir !== turnDirRef.current && !atEdge(dir)) {
          turnDirRef.current = dir;
          setTurnDir(dir);
        }
        turn.setValue(progress);
      },
      onPanResponderRelease: (_, gesture) => {
        const { dir, progress } = progressFor(gesture.dy);
        // A flick counts as much as a long drag: past halfway, or still moving
        // that way fast enough that the finger clearly meant to keep going. The
        // velocity has to agree with the direction — a drag hauled back the way
        // it came is a change of mind, however fast it ends up travelling.
        const flicked = Math.abs(gesture.vy) >= FLICK_VELOCITY && Math.sign(-gesture.vy) === dir;
        const committed = dir !== 0 && !atEdge(dir) && (Math.abs(progress) >= 0.5 || flicked);

        if (!committed) {
          Animated.spring(turn, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }).start(
            ({ finished }) => finished && endTurn(),
          );
          return;
        }

        // Finish the quarter turn from wherever the finger let go, then swap
        // the month in underneath: at a full turn the front face is edge-on
        // and the incoming one is square on, so the face the new month lands
        // on is already the one being looked at.
        Animated.timing(turn, {
          toValue: dir,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (!finished) return;
          const nextMonth = addMonths(today, monthOffset + dir);
          // Pin both faces to the same committed month while the cube is being
          // squared back up. Without that shared render, one face can briefly
          // show the just-left month during the reset and read as a flash.
          setSettlingMonth(nextMonth);
          setSettling(true);
          step(dir);
        });
      },
      onPanResponderTerminate: () => {
        Animated.spring(turn, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }).start(
          ({ finished }) => finished && endTurn(),
        );
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthRange]);

  // The month stacks a letter per line down the left edge, sized to fill the
  // grid's height exactly — so the block reads as one tall word set against
  // the weeks beside it, whatever row count the month works out to. Each letter
  // gets an equal slice of the block, and is sized so its capital fills most of
  // that slice. Whichever binds first wins: the height of a slice, or what's
  // left of the column's width once the corner has its space and the stretch
  // has been applied. Both faces of the cube measure against the front face's
  // grid height, so the two stacks stay the same size through a turn.
  const letterMetrics = (count: number) => {
    const step = stableGridHeight > 0 ? stableGridHeight / count : 0;
    const size =
      step > 0
        ? Math.min((step * CAP_FILL) / CAP_RATIO, (DATE_BLOCK_WIDTH - CORNER_SPACE) / (WIDEST_GLYPH * STRETCH))
        : 18;
    // Only as wide as the widest capital needs, so the stack sits hard against
    // the grid with the corner's space opening up to its left.
    return { step, size, column: size * WIDEST_GLYPH * STRETCH };
  };

  // Local copy of calendar events for optimistic UI updates (delete/remove)
  const [localEvents, setLocalEvents] = useState<CalendarEvent[]>(events);
  useEffect(() => setLocalEvents(events), [events]);

  // Use the `localEvents` copy for all UI so optimistic updates reflect
  // immediately; `localEvents` is kept in sync with `events` via effect above.
  const eventsByDate = useMemo(() => groupEventsByDate(localEvents), [localEvents]);
  const localEventsByDate = useMemo(() => groupEventsByDate(localEvents), [localEvents]);
  const upcoming = useMemo(() => nextEvent(localEvents, today), [localEvents, today]);

  // A tapped day pins the banner to that date. Cleared on a month change so
  // the banner can't keep showing a day that's no longer on screen.
  const [selectedISO, setSelectedISO] = useState<string | null>(null);
  useEffect(() => setSelectedISO(null), [monthOffset]);

  // The last day tapped, whether or not anything is on it. `selectedISO`
  // deliberately refuses empty days because the banner has nothing to show for
  // them, but the tap is still the clearest statement of which day a new event
  // belongs to — so the add form reads this instead.
  const [focusedISO, setFocusedISO] = useState<string | null>(null);
  useEffect(() => setFocusedISO(null), [monthOffset]);

  const onDayPress = (iso: string) => {
    // A second tap on the same day undoes the first, so "+" goes back to
    // defaulting to today rather than staying stuck on a day the user has
    // visibly deselected.
    setFocusedISO((prev) => (prev === iso ? null : iso));
    // Days with nothing on them can't be selected: the banner would fall
    // straight back to the next event, leaving a highlight that explains
    // nothing. Tapping one clears any existing selection instead.
    if (!eventsByDate.has(iso)) {
      setSelectedISO(null);
      return;
    }
    setSelectedISO((prev) => (prev === iso ? null : iso));
  };

  // View mode: when set, the grid is replaced with a stacked list of the
  // selected day's events. `viewingISO` holds the day shown in the list.
  const [viewMode, setViewMode] = useState(false);
  const [viewingISO, setViewingISO] = useState<string | null>(null);
  viewModeRef.current = viewMode;

  // Press and hold a day to read it rather than tapping it and then tapping the
  // banner: the grid is where the day is being looked at, so the gesture that
  // opens its list belongs on the day itself. Empty days open too — the list
  // saying nothing is on is a straighter answer than a cell that ignores the
  // hold.
  const openViewForDay = (iso: string) => {
    setFocusedISO(iso);
    setSelectedISO(eventsByDate.has(iso) ? iso : null);
    setViewingISO(iso);
    setViewMode(true);
  };

  const openViewForBanner = () => {
    const iso = selectedISO ?? banner?.date ?? null;
    if (!iso) return;
    setViewingISO(iso);
    setViewMode(true);
  };

  // What tapping the banner does: turn the month above into that day's list,
  // and turn it back. The banner is the row the list is *about*, so it reads as
  // the handle on it — tapping the thing you're already looking at and getting
  // nothing would be the odd behaviour. The list keeps its own close button for
  // when the banner has scrolled out of reach of the thumb.
  const toggleViewForBanner = () => {
    const iso = selectedISO ?? banner?.date ?? null;
    if (viewMode && iso && viewingISO === iso) {
      setViewMode(false);
      return;
    }
    openViewForBanner();
  };


  // What the banner is actually showing: the selected day's events, else the
  // next one coming up.
  const bannerEvents = (selectedISO && eventsByDate.get(selectedISO)) || (upcoming ? [upcoming] : []);
  const banner = bannerEvents[0] ?? null;
  const alsoOnDay = bannerEvents.length - 1;

  const bannerCategory = banner?.category ? EVENT_CATEGORIES[banner.category] : null;
  const bannerRepeat = banner?.recurrence ? recurrenceCaption(banner.recurrence) : null;

  const bannerDate = useMemo(() => {
    if (!banner) return null;
    const [y, m, d] = banner.date.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [banner]);

  const activeDate = useMemo(() => {
    if (viewMode && viewingISO) return fromISODate(viewingISO);
    if (selectedISO) return fromISODate(selectedISO);
    return bannerDate;
  }, [viewMode, viewingISO, selectedISO, bannerDate]);

  const todayISO = toISODate(today);
  const todayWeekday = today.getDay();

  // Opens on the day the user last tapped, else the day whose events are being
  // listed, else the month being viewed rather than always today — swiping to
  // October and hitting "+" almost always means adding something in October.
  // `isoOverride` is for the "+" under the per-day list, where the day is not
  // in question — it's the one whose events are on screen, whatever was last
  // tapped elsewhere on the calendar.
  const openAddForm = (isoOverride?: string | null) => {
    const tapped = isoOverride ?? focusedISO ?? (viewMode ? viewingISO : null);
    const tappedDate = tapped ? fromISODate(tapped) : null;
    setDraftTitle("");
    setDraftDate(tappedDate ?? (isCurrentMonth ? today : viewedMonth));
    setDraftTime(null);
    setDraftEnd(null);
    setDraftRepeat(null);
    setDraftCategory(null);
    setPicker(null);
    setSaving(false);
    setError(null);
    setEditingId(null);
    setAdding(true);
  };

  useEffect(() => {
    if (openAddSignal === undefined) return;
    // Ignore the initial mount — only open when the signal changes afterward.
    const first = openAddSignalRef.current;
    if (!first) {
      openAddForm();
    } else {
      openAddSignalRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAddSignal]);

  const [editingId, setEditingId] = useState<string | null>(null);

  const openAddSignalRef = useRef(true);

  const openEditForm = async (event: CalendarEvent) => {
    if (event.kind !== "event") return;
    const parts = event.id.split(":");
    // id format produced by toCalendarEvents: event:<rowId>:<occurrenceIndex>:<day>
    const rowId = parts[1];
    let row = rows?.find((r) => r.id === rowId);
    if (!row && onRefresh) {
      // Try refreshing the parent's rows once (the row may be new).
      await onRefresh();
      row = rows?.find((r) => r.id === rowId);
    }
    if (!row) {
      Alert.alert("Event not available", "Couldn't load that event for editing. Try refreshing the calendar.");
      return;
    }
    setDraftTitle(row.title);
    setDraftDate(fromISODate(row.date) ?? today);
    setDraftTime(row.time ? new Date(`${row.date}T${row.time}:00`) : null);
    setDraftEnd(row.endDate ? fromISODate(row.endDate) ?? null : null);
    setDraftRepeat(row.recurrence ?? null);
    setDraftCategory(row.category ?? null);
    setError(null);
    setEditingId(row.id);
    setAdding(true);
  };

  // If the parent's canonical rows change (e.g. an event was deleted
  // elsewhere), prune any occurrences of removed rows from the local
  // optimistic events list so the UI no longer shows deleted items.
  useEffect(() => {
    if (!rows) return;
    const rowIds = new Set(rows.map((r) => r.id));
    setLocalEvents((prev) => {
      const filtered = prev.filter((ev) => {
        if (ev.kind !== "event") return true;
        const parts = ev.id.split(":");
        return rowIds.has(parts[1]);
      });

      // If we're viewing a specific day and its events have just gone, close
      // the view so the banner/list updates to empty. Only when the day had
      // something on it to begin with: a day opened empty by a long press was
      // never showing an event that could disappear, and closing it on the next
      // refresh would snap the list shut under the user.
      if (viewingISO) {
        const hadOnDay = groupEventsByDate(prev).get(viewingISO)?.length ?? 0;
        const remainingByDate = groupEventsByDate(filtered);
        const remainingOnDay = remainingByDate.get(viewingISO) ?? [];
        if (hadOnDay > 0 && remainingOnDay.length === 0) {
          setViewMode(false);
          setSelectedISO(null);
        }
      }

      return filtered;
    });
  }, [rows]);

  const closeAddForm = () => {
    setAdding(false);
    setPicker(null);
    setSaving(false);
    setError(null);
    setEditingId(null);
  };

  // Moving the start past the end would leave the span inside out, so the end
  // is carried along rather than left behind to be rejected on save.
  const changeStart = (next: Date) => {
    setDraftDate(next);
    setDraftEnd((end) => (end && end.getTime() < next.getTime() ? next : end));
  };

  const submit = async () => {
    const title = draftTitle.trim();
    if (!title) {
      setError("Give the event a name");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        date: toISODate(draftDate),
        endDate: draftEnd ? toISODate(draftEnd) : null,
        time: draftTime ? toHHMM(draftTime) : null,
        recurrence: draftRepeat,
        category: draftCategory,
      } as NewFlatEvent;

      if (editingId && onUpdateEvent) {
        try {
          await onUpdateEvent(editingId, payload);
        } catch (err: any) {
          // If the server says the row wasn't found, it may have been
          // deleted elsewhere — fall back to creating a fresh row so the
          // user's change isn't silently lost.
          if (err && err.status === 404) {
            setError("Event not found remotely; creating a new event instead.");
            await onCreateEvent(payload);
          } else {
            throw err;
          }
        }
      } else {
        await onCreateEvent(payload);
      }
      closeAddForm();
    } catch (e: any) {
      if (e && typeof e.status === "number") setError(`${e.status} ${e.message}`);
      else setError(e instanceof Error ? e.message : "Couldn't save that event");
    } finally {
      setSaving(false);
    }
  };

  const performDelete = async (id?: string) => {
    const target = id ?? editingId;
    if (!target || !onDeleteEvent) return;

    // Optimistically remove all occurrences of this row from the local
    // events view so the calendar rings and lists update immediately.
    const before = localEvents;
    setLocalEvents((prev) => prev.filter((ev) => {
      if (ev.kind !== "event") return true;
      const parts = ev.id.split(":");
      return parts[1] !== target;
    }));

    // If the current viewing day has no more events, close view mode so
    // the calendar no longer shows an empty list. Use the pre-delete
    // snapshot (`before`) to compute remaining events synchronously.
    if (viewingISO) {
      const remaining = (before ?? []).filter((ev) => {
        if (ev.kind !== "event") return true;
        const parts = ev.id.split(":");
        return parts[1] !== target;
      });
      const stillHas = remaining.some((ev) => true);
      if (!stillHas) {
        setViewMode(false);
        setSelectedISO(null);
      }
    }

    setSaving(true);
    try {
      await onDeleteEvent(target);
      // Ask the parent to refresh canonical rows if available so the
      // server-and-client stay in sync.
      await onRefresh?.();
      closeAddForm();
      Alert.alert("Deleted", "Event removed");
    } catch (e: any) {
      const status = e && typeof e.status === "number" ? e.status : null;
      // 404 means the server already doesn't have the row — treat as success
      // and keep the optimistic removal so the UI reflects reality.
      if (status === 404) {
        await onRefresh?.();
        closeAddForm();
        Alert.alert("Deleted", "Event already removed");
      } else {
        // Revert optimistic update on other failures and show an error.
        setLocalEvents(before);
        const msg = status ? `${status} ${e.message}` : e instanceof Error ? e.message : "Couldn't delete that event";
        setError(msg);
        Alert.alert("Delete failed", msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // Android shows the picker as its own dialog and reports dismissal through
  // the event; iOS gets a spinner inside a modal sheet further down.
  // What the open picker should be showing, and where a chosen value goes.
  // One pair for all three fields, so the sheet below stays a single instance
  // rather than one per field.
  const pickerValue = picker === "time" ? (draftTime ?? draftDate) : picker === "end" ? (draftEnd ?? draftDate) : draftDate;

  const applyPicked = (selected: Date) => {
    if (picker === "time") setDraftTime(selected);
    else if (picker === "end") setDraftEnd(selected);
    else changeStart(selected);
  };

  const onAndroidPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    setPicker(null);
    if (event.type === "set" && selected) applyPicked(selected);
  };

  // One face of the cube. The incoming face is the whole calendar too, not a
  // picture of one: it's the neighbouring month itself turning into view. It
  // doesn't report its layout, though — the front face is what the card is
  // sized to, and a month one row taller measuring over it mid-turn would
  // resize everything under the finger.
  const renderFace = (monthDate: Date, live: boolean) => {
    const faceMonth = live ? displayedMonth : settlingMonth ?? monthDate;
    const { weeks, columnWeekdays, letters } = buildMonth(faceMonth);
    const { step: letterStep, size: letterSize, column: letterColumn } = letterMetrics(letters.length);
    const activeDateInMonth =
      activeDate &&
      monthDate.getFullYear() === activeDate.getFullYear() &&
      monthDate.getMonth() === activeDate.getMonth();
    const showsSelectedDate = Boolean(viewMode && activeDateInMonth && activeDate);
    const showsToday = !viewMode;
    const cornerSize = showsSelectedDate || showsToday ? DATE_NUM_SIZE : YEAR_SIZE;
    const cornerTextStyle = showsSelectedDate || showsToday ? styles.cornerDate : styles.cornerYear;

    return (
      <>
        <View style={[styles.dateBlock, stableGridHeight > 0 && { height: stableGridHeight }]}>

          {/* Each letter sits in a row exactly one slice tall, keeping its
              natural line box and hanging out of the row top and bottom by the
              empty ascent/descent space. Only that space overflows — the
              capital itself starts on the row's top edge and is shorter than
              the row, so a letter can neither be cropped nor reach the one
              below it. */}
          {letters.map((letter, index) => (
            <View key={index} style={[styles.letterRow, letterStep > 0 && { height: letterStep }]}>
              {/* Rides in the first row rather than in a header of its own, so
                  it stays level with the top of the first letter however the
                  stack is sized. */}
              {index === 0 && (
                <Text
                  style={[
                    styles.corner,
                    cornerTextStyle,
                    { top: -capLeadFor(cornerSize) },
                  ]}
                >
                  {showsSelectedDate && activeDate
                    ? activeDate.getDate()
                    : showsToday
                      ? today.getDate()
                      : monthDate.getFullYear()}
                </Text>
              )}
              <View style={[styles.letterCell, letterColumn > 0 && { width: letterColumn }]}>
                <Text
                  style={[
                    styles.monthLetter,
                    { fontSize: letterSize, marginTop: -capLeadFor(letterSize) },
                  ]}
                >
                  {letter}
                </Text>
              </View>
            </View>
          ))}
        </View>

          <View style={styles.grid} onLayout={live ? onTrackLayout : undefined}>
            {/* If in view mode, replace the month grid with a stacked list of
                events for the chosen day. */}
            {live && viewMode && viewingISO ? (
              <View style={[styles.viewList, { height: viewListHeight }]}>
                {/* The list starts at the top of the card: the day it's about
                    is already named by the date in the corner beside it and by
                    the banner underneath, so a header here would only be
                    repeating them — in the one place where the space is worth
                    another event instead. The controls live along the bottom
                    for the same reason, and land under the thumb rather than up
                    in the far corner. */}
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  {(eventsByDate.get(viewingISO) ?? []).length === 0 && (
                    <Text style={styles.viewEmpty}>Nothing on this day</Text>
                  )}
                  {(eventsByDate.get(viewingISO) ?? []).map((ev, idx) => {
                    const category = ev.category ? EVENT_CATEGORIES[ev.category] : null;
                    return (
                      <View key={ev.id + idx} style={[styles.eventRow, { borderWidth: 0 }]}> 
                        <View style={[styles.eventAccent, { backgroundColor: category?.color ?? NEUTRAL_RING }]} />
                        <View style={styles.eventLeft}>
                          <Text style={styles.eventTitle}>{ev.title}</Text>
                          <Text style={styles.eventWhen}>{ev.time ? formatTime(ev.time) : "All day"}</Text>
                        </View>
                        <View style={styles.eventActions}>
                          <Pressable onPress={() => openEditForm(ev)} style={styles.eventActionButton}>
                            <Ionicons name="pencil" size={16} color={ON_DARK_MUTED} />
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              if (ev.kind === "event") {
                                const parts = ev.id.split(":");
                                const rowId = parts[1];
                                performDelete(rowId);
                              }
                            }}
                            style={styles.eventActionButton}
                          >
                            <Ionicons name="trash" size={16} color={ON_DARK_MUTED} />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
                {/* Both controls ride along the bottom of the list: "+" adds to
                    the day already being looked at, without closing the list to
                    re-aim the calendar's own, and the day it's about is named on
                    the left so the header the list used to carry isn't missed.
                    Down here they're under the thumb, and the top of the card —
                    the easiest place to read — is all events. */}
                <View style={styles.viewFooter}>
                  <Text style={styles.viewFooterDate} numberOfLines={1}>
                    {formatDateLabel(fromISODate(viewingISO) ?? today)}
                  </Text>
                  <Pressable
                    onPress={() => setViewMode(false)}
                    style={styles.viewFooterButton}
                    hitSlop={8}
                    accessibilityLabel="Back to the month"
                  >
                    <Ionicons name="close" size={18} color={ON_DARK_MUTED} />
                  </Pressable>
                  <Pressable
                    onPress={() => openAddForm(viewingISO)}
                    style={[styles.viewFooterButton, styles.viewAddButton]}
                    hitSlop={8}
                    accessibilityLabel={`Add an event on ${formatDateLabel(fromISODate(viewingISO) ?? today)}`}
                  >
                    <Ionicons name="add" size={18} color={ON_DARK} />
                  </Pressable>
                </View>
              </View>
            ) : null}
          {/* Weekday header (S M T ...). Hidden in per-day view mode. */}
          {!(live && viewMode) && (
            <View style={styles.weekRow}>
              {columnWeekdays.map((weekday, index) => (
                <View key={index} style={styles.cell}>
                  <Text style={[styles.weekdayHead, weekday === todayWeekday && styles.weekdayHeadToday]}>
                    {WEEKDAY_INITIALS[weekday]}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {!(live && viewMode) && weeks.map((week, weekIndex) => (
            <View key={weekIndex} style={[styles.weekRow, { height: circle + ROW_GAP }]}>
              {week.map((day, dayIndex) => {
                // Tail of the last row — an empty cell rather than nothing, so
                // the row keeps its seven columns.
                if (!day) return <View key={dayIndex} style={styles.cell} />;

                const iso = toISODate(day);
                const isToday = iso === todayISO;
                const isPast = iso < todayISO;
                const dayEvents = eventsByDate.get(iso);
                const hasEvent = !!dayEvents?.length;
                const isSelected = iso === selectedISO;
                // An empty day can't be selected, but tapping it still aims
                // "+" at it, so it needs to look tapped — otherwise the date
                // the form opens on comes out of nowhere.
                const isFocusedEmpty = !hasEvent && iso === focusedISO;
                // What the day is about outranks who added it: a rent day is a
                // rent day whoever put it there, and the category's colour is
                // the same one every rent day wears. Only once nothing has a
                // category does the creator's own colour take the ring, which
                // is what every event used to do.
                const marker = dayEvents?.find((event) => event.category) ?? dayEvents?.[0];
                const category = marker?.category ? EVENT_CATEGORIES[marker.category] : null;
                const ringColor = category?.color ?? marker?.color ?? NEUTRAL_RING;
                // A day in the middle of a multi-day event is part of it
                // rather than the start of something, so it's washed in the
                // colour instead of ringed — the ring stays the mark of a day
                // where something actually begins.
                const isSpanTail = hasEvent && !dayEvents!.some((event) => event.isStart);

                return (
                  <Pressable
                    key={dayIndex}
                    onPress={() => onDayPress(iso)}
                    // Only the live face is a real calendar — the incoming one
                    // is mid-turn and must not take a gesture.
                    onLongPress={live ? () => openViewForDay(iso) : undefined}
                    delayLongPress={300}
                    accessibilityLabel={[
                      `${day.getDate()} ${monthLabel(viewedMonth)}`,
                      category ? `, ${category.label}` : hasEvent ? ", has events" : "",
                    ].join("")}
                    accessibilityHint="Press and hold to see everything on this day"
                    style={styles.cell}
                  >
                    <View
                      style={[
                        styles.day,
                        { width: circle, height: circle, borderRadius: circle / 2 },
                        hasEvent && { backgroundColor: withAlpha(ringColor, isSpanTail ? 0.22 : 0.14) },
                        hasEvent && !isSpanTail && { borderWidth: 2, borderColor: ringColor },
                        // Thicker ring rather than a solid fill: the colour is
                        // a flatmate's own or a category's, and filling with it
                        // would leave the day number unreadable on the lighter
                        // of them.
                        isSelected && { borderWidth: 2.5, borderColor: ringColor },
                        isFocusedEmpty && { borderWidth: 1.5, borderColor: NEUTRAL_RING },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNum,
                          { fontSize: dayNumSize },
                          isPast && { color: ON_DARK_PAST },
                          // Today is marked in the month's own red rather than
                          // by a disc, which keeps a ring meaning one thing.
                          isToday && { color: CAL_RED },
                        ]}
                      >
                        {day.getDate()}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
          </View>
      </>
    );
  };

  // Half the cube's side: the axis it turns on runs through the middle of the
  // face, so every offset below is measured from there.
  const half = (stableGridHeight || 200) / 2;
  // Which way the cube is being rolled. Falls back to 1 so the incoming face's
  // interpolations are still well-formed on the renders where nothing is
  // turning and it isn't mounted at all.
  const spin = turnDir || 1;

  // Memoised, not rebuilt each render. Every one of these is a native animated
  // node wired to a view prop, and handing the same view a *new* node means
  // tearing the old one down and connecting the replacement. The direction
  // being picked mid-drag is a state change, so without this the whole graph
  // was being re-attached in the middle of the gesture it was driving — which
  // is exactly where a hitch shows. Only a real change of geometry (the card's
  // height, or the direction of travel) rebuilds them now.
  const { front, incoming } = useMemo(
    () => ({
      // The face being looked at, swinging back and up (or down) out of the way.
      front: {
        translateY: turn.interpolate({
          inputRange: TURN_SAMPLES,
          outputRange: sampleTurn((p) => -half * Math.sin(turnAngle(p))),
        }),
        rotate: turn.interpolate({ inputRange: [-1, 1], outputRange: ["-90deg", "90deg"] }),
        scale: turn.interpolate({
          inputRange: TURN_SAMPLES,
          outputRange: sampleTurn((p) => depthScale(half - half * Math.cos(turnAngle(p)))),
        }),
        // Full light square on, down to (1 - CUBE_SHADE) edge-on. Clamped
        // because this one ends up as an opacity: the cancel spring is bouncy
        // and `turn` can cross zero on its way to rest, and extrapolating past
        // the samples would put the value outside 0..1.
        light: turn.interpolate({
          inputRange: TURN_SAMPLES,
          outputRange: sampleTurn((p) => 1 - CUBE_SHADE * (1 - Math.cos(turnAngle(p)))),
          extrapolate: "clamp",
        }),
      },
      // The next face, coming round from behind: it starts a full side length
      // away and edge-on, and arrives square on the screen plane exactly as the
      // front face finishes leaving it.
      incoming: {
        translateY: turn.interpolate({
          inputRange: TURN_SAMPLES,
          outputRange: sampleTurn((p) => spin * half * Math.cos(turnAngle(p))),
        }),
        rotate: turn.interpolate({
          inputRange: [-1, 1],
          outputRange: [`${-90 - spin * 90}deg`, `${90 - spin * 90}deg`],
        }),
        scale: turn.interpolate({
          inputRange: TURN_SAMPLES,
          outputRange: sampleTurn((p) => depthScale(half - spin * half * Math.sin(turnAngle(p)))),
        }),
        light: turn.interpolate({
          inputRange: TURN_SAMPLES,
          outputRange: sampleTurn((p) => 1 - CUBE_SHADE * (1 - Math.abs(Math.sin(turnAngle(p))))),
          extrapolate: "clamp",
        }),
      },
    }),
    [turn, half, spin],
  );

  if (adding) {
    return (
      <View style={styles.card}>
        <View style={styles.formHeader}>
          <Text style={styles.formTitle}>New event</Text>
          <Pressable onPress={closeAddForm} hitSlop={8} accessibilityLabel="Cancel">
            <Ionicons name="close" size={18} color={ON_DARK_MUTED} />
          </Pressable>
        </View>

        <TextInput
          style={styles.input}
          value={draftTitle}
          onChangeText={(text) => {
            setDraftTitle(text);
            if (error) setError(null);
          }}
          placeholder="What's on?"
          placeholderTextColor={ON_DARK_MUTED}
          maxLength={120}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={submit}
        />

        <View style={styles.fieldRow}>
          <Pressable style={styles.field} onPress={() => setPicker("date")}>
            <Ionicons name="calendar-outline" size={14} color={ON_DARK_MUTED} />
            <Text style={styles.fieldText}>{formatDateLabel(draftDate)}</Text>
          </Pressable>

          <Pressable style={styles.field} onPress={() => setPicker("time")}>
            <Ionicons name="time-outline" size={14} color={ON_DARK_MUTED} />
            <Text style={[styles.fieldText, !draftTime && { color: ON_DARK_MUTED }]}>
              {draftTime ? formatTime(toHHMM(draftTime)) : "All day"}
            </Text>
          </Pressable>

          {draftTime && (
            <Pressable onPress={() => setDraftTime(null)} hitSlop={8} accessibilityLabel="Clear time">
              <Ionicons name="close-circle" size={16} color={ON_DARK_MUTED} />
            </Pressable>
          )}
        </View>

        <View style={styles.fieldRow}>
          {draftEnd ? (
            <>
              <Pressable style={styles.field} onPress={() => setPicker("end")}>
                <Ionicons name="arrow-forward" size={14} color={ON_DARK_MUTED} />
                <Text style={styles.fieldText}>{formatDateLabel(draftEnd)}</Text>
              </Pressable>
              <Pressable onPress={() => setDraftEnd(null)} hitSlop={8} accessibilityLabel="Clear end date">
                <Ionicons name="close-circle" size={16} color={ON_DARK_MUTED} />
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.field} onPress={() => setDraftEnd(addDays(draftDate, 1))}>
              <Ionicons name="add" size={14} color={ON_DARK_MUTED} />
              <Text style={[styles.fieldText, { color: ON_DARK_MUTED }]}>Runs over days</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.pickerLabel}>Repeats</Text>
        <View style={styles.chipRow}>
          {RECURRENCE_ORDER.map((option) => {
            const active = draftRepeat === option;
            return (
              <Pressable
                key={option}
                onPress={() => setDraftRepeat(active ? null : option)}
                style={[styles.chip, active && { backgroundColor: CAL_RED, borderColor: CAL_RED }]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {RECURRENCE_LABELS[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.pickerLabel}>Category</Text>
        <View style={styles.chipRow}>
          {CATEGORY_ORDER.map((option) => {
            const style = EVENT_CATEGORIES[option];
            const active = draftCategory === option;
            return (
              <Pressable
                key={option}
                onPress={() => setDraftCategory(active ? null : option)}
                style={[
                  styles.chip,
                  { borderColor: active ? style.color : ON_DARK_LINE },
                  active && { backgroundColor: withAlpha(style.color, 0.2) },
                ]}
              >
                <Ionicons
                  name={style.icon as never}
                  size={12}
                  color={active ? style.color : ON_DARK_MUTED}
                />
                <Text style={[styles.chipText, active && { color: style.color }]}>{style.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.saveButton, saving && { opacity: 0.6 }]}
          onPress={submit}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.accentText} />
          ) : (
            <Text style={styles.saveLabel}>{editingId ? "Save changes" : "Add to calendar"}</Text>
          )}
        </Pressable>

        {Platform.OS === "android" && picker !== null && (
          <DateTimePicker
            value={pickerValue}
            mode={picker === "time" ? "time" : "date"}
            display="default"
            minimumDate={picker === "end" ? draftDate : undefined}
            onChange={onAndroidPickerChange}
          />
        )}

        {Platform.OS === "ios" && (
          <Modal
            visible={picker !== null}
            transparent
            animationType="slide"
            onRequestClose={() => setPicker(null)}
          >
            <Pressable style={styles.pickerBackdrop} onPress={() => setPicker(null)}>
              <Pressable style={styles.pickerSheet} onPress={() => {}}>
                <DateTimePicker
                  value={pickerValue}
                  mode={picker === "time" ? "time" : "date"}
                  display="spinner"
                  themeVariant={scheme}
                  minimumDate={picker === "end" ? draftDate : undefined}
                  onChange={(_, selected) => selected && applyPicked(selected)}
                />
                <Pressable style={styles.pickerDone} onPress={() => setPicker(null)}>
                  <Text style={styles.saveLabel}>Done</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>
        )}
      </View>
    );
  }

  return (
    <>
      <View style={[styles.card, styles.monthCard, { overflow: "hidden" }]} {...panResponder.panHandlers}>
        <View style={styles.cubeStage}>
          <Animated.View
            style={[
              styles.topRow,
              styles.cubeFace,
              {
                opacity: front.light,
                transform: [
                  { perspective: CUBE_PERSPECTIVE },
                  { translateY: front.translateY },
                  { rotateX: front.rotate },
                  { scale: front.scale },
                ],
              },
            ]}
          >
            {renderFace(displayedMonth, true)}
          </Animated.View>

          {turnDir !== 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                styles.topRow,
                styles.cubeFace,
                styles.cubeFaceIncoming,
                {
                  opacity: incoming.light,
                  transform: [
                    { perspective: CUBE_PERSPECTIVE },
                    { translateY: incoming.translateY },
                    { rotateX: incoming.rotate },
                    { scale: incoming.scale },
                  ],
                },
              ]}
            >
              {renderFace(incomingMonth, false)}
            </Animated.View>
          )}
        </View>
      </View>

      <Pressable
        style={[styles.card, styles.eventCard]}
        onPress={toggleViewForBanner}
        disabled={!banner}
        accessibilityRole="button"
        accessibilityState={{ expanded: viewMode }}
        accessibilityLabel={
          banner ? (viewMode ? "Back to the month" : `Show everything on ${banner.date}`) : undefined
        }
        onLongPress={() => {
          if (!banner) return;
          if (banner.kind !== "event") return;
          const parts = banner.id.split(":");
          const rowId = parts[1];
          const row = rows?.find((r) => r.id === rowId);
          if (!row) return;
          const buttons: any[] = [];
          if (onUpdateEvent) buttons.push({ text: "Edit", onPress: () => openEditForm(banner) });
          if (onDeleteEvent)
            buttons.push({ text: "Delete", style: "destructive" as const, onPress: () => performDelete(row.id) });
          buttons.push({ text: "Cancel", style: "cancel" as const });
          Alert.alert("Event", row.title, buttons as any);
        }}
      >
        {banner && activeDate ? (
          <>
            <View style={styles.nextDay}>
              <Text style={styles.nextWeekday}>{weekdayLabel(activeDate)}</Text>
              <Text style={styles.nextDayNum}>{activeDate.getDate()}</Text>
            </View>

            {bannerCategory && (
              <View style={[styles.nextIcon, { backgroundColor: withAlpha(bannerCategory.color, 0.18) }]}>
                <Ionicons name={bannerCategory.icon as never} size={14} color={bannerCategory.color} />
              </View>
            )}

            <View style={styles.nextBody}>
              <Text style={styles.nextTitle} numberOfLines={1}>
                {banner.title}
              </Text>
              <Text style={styles.nextWhen} numberOfLines={1}>
                {[
                  banner.time ? formatTime(banner.time) : null,
                  relativeDayLabel(activeDate, today),
                  banner.spanDays > 1 ? `${banner.spanDays} days` : null,
                  bannerRepeat,
                  alsoOnDay > 0 ? `+${alsoOnDay} more` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          </>
        ) : (
          <Text style={[styles.empty, styles.nextBody]}>Nothing coming up</Text>
        )}

        <View>
          <AnimatedAddAction
            banner={banner}
            onAdd={() => openAddForm()}
            onEdit={() => banner && openEditForm(banner)}
            onDelete={() => banner && banner.kind === "event" && performDelete(banner.id.split(":")[1])}
            onView={() => openViewForBanner()}
          />
        </View>
      </Pressable>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: CAL_DARK,
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
    },
    // The two boxes sit closer to each other than the pair does to whatever
    // follows, so they still read as one widget in two parts rather than as
    // two unrelated cards that happen to be adjacent.
    monthCard: { marginBottom: 8 },
    eventCard: { flexDirection: "row", alignItems: "center", gap: 12 },
    topRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    cubeStage: { position: "relative" },
    // Hidden backfaces, so a face turned past square disappears rather than
    // showing its month mirrored.
    cubeFace: { backfaceVisibility: "hidden" },
    // Clipped, so a month one week taller than the one on screen can't spill
    // out of the height the front face set. Only the incoming face is clipped:
    // the letters down the left hang out of their rows by design, and the face
    // being read must not crop them.
    cubeFaceIncoming: { overflow: "hidden" },
    // Stretch, not flex-start: the rows have to span the column for the letter
    // cell to be pushed to its right edge and the corner to its left.
    dateBlock: { width: DATE_BLOCK_WIDTH, alignItems: "stretch", justifyContent: "center" },
    letterRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      // Top, not stretch: the letter hangs from its row's top edge, which is
      // the line the corner date is aligned to.
      alignItems: "flex-start",
      overflow: "visible",
    },
    // The letter is centred in a cell only as wide as it needs, so the stretch
    // below scales about that cell's middle and can't walk off the block.
    letterCell: { overflow: "visible" },
    corner: {
      position: "absolute",
      left: 0,
      fontFamily: fonts.bold,
      letterSpacing: 0.5,
      includeFontPadding: false,
    },
    cornerDate: { fontSize: DATE_NUM_SIZE, color: CAL_RED },
    // Muted rather than red: on a month that isn't this one the year is
    // orientation, not the headline the date is.
    // No tracking of its own — four digits plus letterSpacing is what would
    // run the year into the letters now the two sit this close.
    cornerYear: { fontSize: YEAR_SIZE, letterSpacing: 0, color: ON_DARK_MUTED },
    monthLetter: {
      fontFamily: fonts.display,
      color: CAL_RED,
      textAlign: "center",
      // No tracking: on a single glyph letterSpacing is pure trailing space,
      // which would throw every letter off centre by half of it.
      letterSpacing: 0,
      // Android otherwise pads the line box out beyond the font's own metrics,
      // which shifts the capital off the centre of its row.
      includeFontPadding: false,
      transform: [{ scaleX: STRETCH }],
    },
    grid: { flex: 1 },
    weekRow: { flexDirection: "row" },
    // Flexed rather than measured, so seven of them span the track exactly and
    // every row's columns land in the same places.
    cell: { flex: 1, alignItems: "center", justifyContent: "center" },
    weekdayHead: {
      fontFamily: fonts.bold,
      fontSize: 12,
      letterSpacing: 1,
      color: ON_DARK_MUTED,
      marginBottom: 6,
    },
    weekdayHeadToday: { color: CAL_RED },
    day: {
      // No fill and no border of its own: a ring is drawn on top only for days
      // that actually carry an event, which is the one thing it can mean.
      borderWidth: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    dayNum: { fontFamily: fonts.bold, color: ON_DARK },
    nextDay: { alignItems: "center", minWidth: 40 },
    nextWeekday: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1, color: ON_DARK_MUTED },
    nextDayNum: { fontFamily: fonts.display, fontSize: 20, color: ON_DARK },
    nextIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    nextBody: { flex: 1 },
    // No top padding: the first event starts at the top edge of the card, level
    // with the month letters beside it.
    viewList: { paddingHorizontal: 8, paddingBottom: 2 },
    viewEmpty: { color: ON_DARK_MUTED, fontFamily: fonts.regular, fontSize: 13, paddingVertical: 10 },
    eventRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 8, marginBottom: 8 },
    eventAccent: { width: 6, height: 36, borderRadius: 3, marginRight: 10 },
    eventLeft: { flex: 1 },
    eventTitle: { color: ON_DARK, fontFamily: fonts.regular, fontSize: 15 },
    eventWhen: { color: ON_DARK_PAST, fontSize: 12, marginTop: 2 },
    eventActions: { flexDirection: "row" },
    eventActionButton: { marginLeft: 12 },
    // Ruled off from the list so it doesn't read as another event row. Sits
    // last in a column the height of the whole card, so it's pinned to the
    // bottom edge and the scrolling list takes everything above it.
    viewFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: ON_DARK_LINE,
      paddingTop: 6,
      marginTop: 2,
    },
    // Takes the slack, which pushes both buttons to the right edge.
    viewFooterDate: { flex: 1, fontFamily: fonts.bold, fontSize: 12, color: ON_DARK_MUTED },
    viewFooterButton: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    viewAddButton: {
      borderWidth: 1.5,
      borderColor: ON_DARK_LINE,
    },
    pickerLabel: {
      fontFamily: fonts.bold,
      fontSize: 9,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: ON_DARK_MUTED,
      marginTop: 12,
      marginBottom: 6,
    },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderWidth: 1,
      borderColor: ON_DARK_LINE,
      borderRadius: 999,
      paddingVertical: 5,
      paddingHorizontal: 10,
    },
    chipText: { fontFamily: fonts.bold, fontSize: 11, color: ON_DARK_MUTED },
    // The repeat chips fill with the card's red, which is dark enough behind
    // this that the label has to flip rather than just brighten.
    chipTextActive: { color: ON_DARK },
    nextTitle: { fontFamily: fonts.bold, fontSize: 15, color: ON_DARK },
    nextWhen: { fontFamily: fonts.regular, fontSize: 12, color: ON_DARK_MUTED, marginTop: 3 },
    empty: { fontFamily: fonts.regular, fontSize: 13, color: ON_DARK_MUTED },
    // A solid pastel disc rather than the soft tint used on light surfaces —
    // `accentSoft` is a wash of `accentInk`, which is deepened for light
    // backgrounds and disappears into this plate.
    addButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },

    // --- add form ---------------------------------------------------------
    formHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    formTitle: { fontFamily: fonts.display, fontSize: 15, letterSpacing: 1, color: ON_DARK },
    input: {
      fontFamily: fonts.regular,
      fontSize: 14,
      color: ON_DARK,
      backgroundColor: CAL_FIELD,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    fieldRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: CAL_FIELD,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    fieldText: { fontFamily: fonts.bold, fontSize: 12, color: ON_DARK },
    // The theme's danger red is mixed for light surfaces and goes muddy on
    // this plate — the card's own red is the one that carries here.
    error: { fontFamily: fonts.regular, fontSize: 11, color: CAL_RED, marginTop: 8 },
    saveButton: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 12,
    },
    saveLabel: { fontFamily: fonts.bold, fontSize: 13, color: colors.accentText, letterSpacing: 0.5 },
    pickerBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.45)" },
    pickerSheet: { backgroundColor: colors.surface, paddingBottom: 28, paddingTop: 8 },
    pickerDone: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: "center",
      marginHorizontal: 20,
      marginTop: 4,
    },
  });
}
