import React, { useEffect, useMemo, useRef, useState } from "react";
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
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import type { CalendarEvent, NewFlatEvent } from "../types";
import {
  addMonths,
  daysInMonth,
  formatTime,
  groupEventsByDate,
  monthLabel,
  nextEvent,
  relativeDayLabel,
  toISODate,
  weekdayLabel,
} from "../utils/calendarEvents";

// Circles are sized to fill the track exactly rather than left at a fixed
// width, so rows sit flush with both edges of the card. MIN_CIRCLE only sets
// how many columns fit before the remainder is shared out between them.
// Small circles are the whole point: more columns per row means fewer rows,
// which is what keeps the card wider than it is tall.
const MIN_CIRCLE = 22;
const GAP = 4;
// Fixed rather than content-sized on purpose: the block's width feeds the
// track's width, which decides the column count, which decides the row count,
// which is what scales this block's type. Letting it size to its own text
// would close that loop and let the layout oscillate. Wide enough for a
// three-letter month at MAX_MONTH_SIZE in RussoOne.
const DATE_BLOCK_WIDTH = 64;
const MAX_MONTH_SIZE = 30;

// How far a vertical drag has to travel before it counts as a month step, and
// how far before the card claims the gesture from the page's ScrollView at all.
const SWIPE_THRESHOLD = 40;
const CLAIM_THRESHOLD = 14;

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
};

// Local HH:MM off a Date the picker handed back — the stored value is
// wall-clock, so no UTC conversion may happen on the way in.
const toHHMM = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const formatDateLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

// Compact month view for the top of the home screen: today's date and month
// on the left, the whole current month as day circles wrapped across rows on
// the right, then whatever's next on the calendar underneath. Today reads as a
// filled circle; any day carrying an event gets a ring, so both states can
// show at once on the same circle.
export default function CalendarStrip({ events, today, monthRange, onCreateEvent }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // The card is either the calendar or the add form — never both. Swapping in
  // place is what the "+" turns the widget into.
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDate, setDraftDate] = useState(today);
  const [draftTime, setDraftTime] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Months away from today. Reset whenever `today` changes — the caller hands
  // a fresh date on every screen focus, so coming back to the tab lands on the
  // current month rather than wherever the last swipe left off.
  const [monthOffset, setMonthOffset] = useState(0);
  useEffect(() => setMonthOffset(0), [today]);

  // Two measurements drive the layout: the track's width decides the column
  // count, and the height it wraps to is what the date block then matches.
  const [trackWidth, setTrackWidth] = useState(0);
  const [gridHeight, setGridHeight] = useState(0);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setTrackWidth(width);
    setGridHeight(height);
  };

  const columns = trackWidth > 0 ? Math.max(1, Math.floor((trackWidth + GAP) / (MIN_CIRCLE + GAP))) : 0;
  const circle = columns > 0 ? (trackWidth - GAP * (columns - 1)) / columns : MIN_CIRCLE;

  const viewedMonth = useMemo(() => addMonths(today, monthOffset), [today, monthOffset]);
  const isCurrentMonth = monthOffset === 0;

  const days = useMemo(() => {
    const year = viewedMonth.getFullYear();
    const month = viewedMonth.getMonth();
    return Array.from({ length: daysInMonth(year, month) }, (_, i) => new Date(year, month, i + 1));
  }, [viewedMonth]);

  // Slide + fade in the direction of travel, so a swipe reads as the months
  // moving rather than the numbers just blinking to new values.
  const shift = useRef(new Animated.Value(0)).current;
  const directionRef = useRef(0);

  const step = (delta: number) => {
    setMonthOffset((current) => {
      const next = current + delta;
      if (next < -monthRange || next > monthRange) return current;
      directionRef.current = delta;
      return next;
    });
  };

  useEffect(() => {
    if (directionRef.current === 0) return;
    shift.setValue(directionRef.current > 0 ? 14 : -14);
    Animated.timing(shift, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, [monthOffset, shift]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Only claims clearly-vertical drags, and only past a threshold — a
        // tap or a diagonal flick still belongs to the ScrollView underneath.
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > CLAIM_THRESHOLD && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy <= -SWIPE_THRESHOLD) step(1);
          else if (gesture.dy >= SWIPE_THRESHOLD) step(-1);
        },
      }),
    // `step` closes over nothing that changes except monthRange, and setState
    // with an updater keeps it independent of the current offset.
    [monthRange],
  );

  // Scaled off the wrapped grid so the date block reads as the same block of
  // height as the rows beside it, whatever the month's row count works out to.
  const monthSize = gridHeight > 0 ? Math.min(MAX_MONTH_SIZE, Math.max(18, gridHeight * 0.3)) : 18;
  const dateSize = Math.round(monthSize * 0.45);

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const upcoming = useMemo(() => nextEvent(events, today), [events, today]);

  // A tapped day pins the banner to that date. Cleared on a month change so
  // the banner can't keep showing a day that's no longer on screen.
  const [selectedISO, setSelectedISO] = useState<string | null>(null);
  useEffect(() => setSelectedISO(null), [monthOffset]);

  const onDayPress = (iso: string) => {
    // Days with nothing on them can't be selected: the banner would fall
    // straight back to the next event, leaving a highlight that explains
    // nothing. Tapping one clears any existing selection instead.
    if (!eventsByDate.has(iso)) {
      setSelectedISO(null);
      return;
    }
    setSelectedISO((prev) => (prev === iso ? null : iso));
  };

  // What the banner is actually showing: the selected day's events, else the
  // next one coming up.
  const bannerEvents = (selectedISO && eventsByDate.get(selectedISO)) || (upcoming ? [upcoming] : []);
  const banner = bannerEvents[0] ?? null;
  const alsoOnDay = bannerEvents.length - 1;

  const bannerDate = useMemo(() => {
    if (!banner) return null;
    const [y, m, d] = banner.date.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [banner]);

  const todayISO = toISODate(today);

  // Opens on the month being viewed rather than always today — swiping to
  // October and hitting "+" almost always means adding something in October.
  const openAddForm = () => {
    setDraftTitle("");
    setDraftDate(isCurrentMonth ? today : viewedMonth);
    setDraftTime(null);
    setError(null);
    setAdding(true);
  };

  const closeAddForm = () => {
    setAdding(false);
    setShowDatePicker(false);
    setShowTimePicker(false);
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
      await onCreateEvent({
        title,
        date: toISODate(draftDate),
        time: draftTime ? toHHMM(draftTime) : null,
      });
      closeAddForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that event");
    } finally {
      setSaving(false);
    }
  };

  // Android shows the picker as its own dialog and reports dismissal through
  // the event; iOS gets a spinner inside a modal sheet further down.
  const onAndroidDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShowDatePicker(false);
    if (event.type === "set" && selected) setDraftDate(selected);
  };

  const onAndroidTimeChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShowTimePicker(false);
    if (event.type === "set" && selected) setDraftTime(selected);
  };

  if (adding) {
    return (
      <View style={styles.card}>
        <View style={styles.formHeader}>
          <Text style={styles.formTitle}>New event</Text>
          <Pressable onPress={closeAddForm} hitSlop={8} accessibilityLabel="Cancel">
            <Ionicons name="close" size={18} color={colors.textMuted} />
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
          placeholderTextColor={colors.textMuted}
          maxLength={120}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={submit}
        />

        <View style={styles.fieldRow}>
          <Pressable style={styles.field} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
            <Text style={styles.fieldText}>{formatDateLabel(draftDate)}</Text>
          </Pressable>

          <Pressable style={styles.field} onPress={() => setShowTimePicker(true)}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.fieldText, !draftTime && { color: colors.textMuted }]}>
              {draftTime ? formatTime(toHHMM(draftTime)) : "All day"}
            </Text>
          </Pressable>

          {/* Only offered once a time exists — this is how you get back to an
              all-day event after setting one. */}
          {draftTime && (
            <Pressable onPress={() => setDraftTime(null)} hitSlop={8} accessibilityLabel="Clear time">
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
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
            <Text style={styles.saveLabel}>Add to calendar</Text>
          )}
        </Pressable>

        {Platform.OS === "android" && showDatePicker && (
          <DateTimePicker value={draftDate} mode="date" display="default" onChange={onAndroidDateChange} />
        )}
        {Platform.OS === "android" && showTimePicker && (
          <DateTimePicker
            value={draftTime ?? draftDate}
            mode="time"
            display="default"
            onChange={onAndroidTimeChange}
          />
        )}

        {Platform.OS === "ios" && (
          <Modal
            visible={showDatePicker || showTimePicker}
            transparent
            animationType="slide"
            onRequestClose={() => {
              setShowDatePicker(false);
              setShowTimePicker(false);
            }}
          >
            <Pressable
              style={styles.pickerBackdrop}
              onPress={() => {
                setShowDatePicker(false);
                setShowTimePicker(false);
              }}
            >
              <Pressable style={styles.pickerSheet} onPress={() => {}}>
                <DateTimePicker
                  value={showTimePicker ? (draftTime ?? draftDate) : draftDate}
                  mode={showTimePicker ? "time" : "date"}
                  display="spinner"
                  themeVariant={scheme}
                  onChange={(_, selected) => {
                    if (!selected) return;
                    if (showTimePicker) setDraftTime(selected);
                    else setDraftDate(selected);
                  }}
                />
                <Pressable
                  style={styles.pickerDone}
                  onPress={() => {
                    setShowDatePicker(false);
                    setShowTimePicker(false);
                  }}
                >
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
    <View style={styles.card} {...panResponder.panHandlers}>
      <Animated.View style={[styles.topRow, { transform: [{ translateY: shift }] }]}>
        <View style={[styles.dateBlock, gridHeight > 0 && { height: gridHeight }]}>
          {/* Today's date only means something on the current month; browsing
              elsewhere, the year is the orientation that actually helps. */}
          <Text style={[styles.dateSmall, { fontSize: dateSize }]}>
            {isCurrentMonth ? today.getDate() : viewedMonth.getFullYear()}
          </Text>
          {/* Shrinks instead of clipping if a locale's short month runs wide. */}
          <Text style={[styles.month, { fontSize: monthSize }]} numberOfLines={1} adjustsFontSizeToFit>
            {monthLabel(viewedMonth)}
          </Text>
        </View>

        <View style={styles.track} onLayout={onTrackLayout}>
          {columns > 0 &&
            days.map((day) => {
              const iso = toISODate(day);
              const isToday = iso === todayISO;
              const isPast = iso < todayISO;
              const dayEvents = eventsByDate.get(iso);
              const hasEvent = !!dayEvents?.length;
              const isSelected = iso === selectedISO;
              // A member's own colour wins the ring when they have one, so a
              // birthday ring matches that flatmate everywhere else in the app.
              const ringColor = dayEvents?.[0]?.color ?? colors.info;

              return (
                <Pressable
                  key={iso}
                  onPress={() => onDayPress(iso)}
                  accessibilityLabel={`${day.getDate()} ${monthLabel(viewedMonth)}${hasEvent ? ", has events" : ""}`}
                  style={[
                    styles.day,
                    { width: circle, height: circle, borderRadius: circle / 2 },
                    isToday && { backgroundColor: colors.accent, borderColor: colors.accent },
                    hasEvent && { borderColor: ringColor },
                    // Thicker ring rather than a fill: the ring colour is the
                    // flatmate's own, and filling with it would leave the day
                    // number unreadable on the lighter member colours.
                    isSelected && { borderWidth: 2.5, borderColor: ringColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNum,
                      isPast && { color: colors.textMuted },
                      isToday && { color: colors.accentText },
                      isSelected && !isToday && { color: ringColor },
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                </Pressable>
              );
            })}
        </View>
      </Animated.View>

      <View style={styles.divider} />

      <View style={styles.nextRow}>
        {banner && bannerDate ? (
          <>
            <View style={styles.nextDay}>
              <Text style={styles.nextWeekday}>{weekdayLabel(bannerDate)}</Text>
              <Text style={styles.nextDayNum}>{bannerDate.getDate()}</Text>
            </View>
            <View style={styles.nextBody}>
              <Text style={styles.nextTitle} numberOfLines={1}>
                {banner.title}
              </Text>
              {/* A time turns the caption into "7:30 pm · in 4 days"; an
                  all-day event just says when. A selected day carrying more
                  than one event says so rather than silently hiding them. */}
              <Text style={styles.nextWhen}>
                {banner.time ? `${formatTime(banner.time)} · ` : ""}
                {relativeDayLabel(bannerDate, today)}
                {alsoOnDay > 0 ? ` · +${alsoOnDay} more` : ""}
              </Text>
            </View>
          </>
        ) : (
          <Text style={[styles.empty, styles.nextBody]}>Nothing coming up</Text>
        )}

        <Pressable
          style={styles.addButton}
          onPress={openAddForm}
          hitSlop={8}
          accessibilityLabel="Add an event to the flat calendar"
        >
          <Ionicons name="add" size={20} color={colors.accent} />
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
    },
    topRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    dateBlock: { width: DATE_BLOCK_WIDTH, alignItems: "flex-start", justifyContent: "center" },
    dateSmall: {
      fontFamily: fonts.bold,
      letterSpacing: 1,
      color: colors.textMuted,
    },
    month: {
      fontFamily: fonts.display,
      letterSpacing: 1,
      color: colors.text,
      marginTop: 2,
    },
    track: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: GAP },
    day: {
      borderWidth: 1.5,
      borderColor: "transparent",
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    dayNum: { fontFamily: fonts.bold, fontSize: 10, color: colors.text },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 11 },
    nextRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    nextDay: { alignItems: "center", minWidth: 34 },
    nextWeekday: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1, color: colors.textMuted },
    nextDayNum: { fontFamily: fonts.display, fontSize: 16, color: colors.text },
    nextBody: { flex: 1 },
    nextTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
    nextWhen: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted, marginTop: 2 },
    empty: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
    addButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.accentSoft,
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
    formTitle: { fontFamily: fonts.display, fontSize: 15, letterSpacing: 1, color: colors.text },
    input: {
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    fieldRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    fieldText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
    error: { fontFamily: fonts.regular, fontSize: 11, color: colors.danger, marginTop: 8 },
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
