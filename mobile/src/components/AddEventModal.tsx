import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import ModalSheet, { createFormStyles } from "./ModalSheet";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import {
  CATEGORY_ORDER,
  EVENT_CATEGORIES,
  RECURRENCE_LABELS,
  RECURRENCE_ORDER,
  recurrenceCaption,
} from "../theme/eventCategories";
import { formatTime as formatEventTime, fromISODate, toISODate } from "../utils/calendarEvents";
import type { EventCategory, EventRecurrence, FlatEvent, NewFlatEvent } from "../types";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateLabel(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatTimeLabel(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// HH:MM, 24-hour — what the server stores.
function toTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function addOneDay(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d;
}

type DropdownRow = { key: string; label: string; active: boolean; onPress: () => void };

// The same trigger-and-list shape as the app-wide SelectDropdown, but taking
// rows with their own press handlers rather than a fixed value list — Ends
// and Time need a row that opens a native picker rather than just setting a
// value, which SelectDropdown's plain onChange(value) can't express.
//
// Short lists (Ends, Time — two rows each) float over whatever sits below
// them (`position: absolute`) rather than pushing it down the form. Longer
// ones (Category, Repeat) render inline instead: a floating list capped to a
// fixed height and scrolled on its own, nested inside the modal's own
// ScrollView, turned out to fight that outer scroll rather than genuinely
// scroll — the list would just run off the bottom of the modal with no way
// to reach the rest of it. Inline, the outer ScrollView (already reliably
// scrollable) does the work instead: it just pushes the fields below it down
// while open, the same way the whole form already handles a growing list.
//
// Open state is lifted to the parent rather than kept locally: only one
// panel — any dropdown or either native date/time picker — can be open
// across the whole form at a time, and a tap anywhere outside it closes it,
// both of which need one shared place to coordinate from.
function OptionDropdown({
  label,
  rows,
  colors,
  open,
  onOpenChange,
  variant = "floating",
}: {
  label: string;
  rows: DropdownRow[];
  colors: ThemeColors;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: "floating" | "inline";
}) {
  const [mounted, setMounted] = useState(open);
  const anim = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: open ? 160 : 120,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, anim]);

  return (
    <View style={{ zIndex: open ? 30 : 1 }}>
      <Pressable
        style={[dd.trigger, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
        onPress={() => onOpenChange(!open)}
        accessibilityRole="button"
      >
        <Text style={[dd.triggerText, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
      </Pressable>

      {mounted && (
        <Animated.View
          style={[
            variant === "floating" ? dd.dropdown : dd.dropdownInline,
            { backgroundColor: colors.surface, borderColor: colors.border },
            {
              opacity: anim,
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
            },
          ]}
        >
          {rows.map((row) => (
            <Pressable
              key={row.key}
              style={[dd.option, row.active && { backgroundColor: colors.accent }]}
              onPress={() => {
                row.onPress();
                onOpenChange(false);
              }}
            >
              <Text
                style={[dd.optionText, { color: row.active ? colors.accentText : colors.text }]}
                numberOfLines={1}
              >
                {row.label}
              </Text>
              {row.active && <Ionicons name="checkmark" size={16} color={colors.accentText} />}
            </Pressable>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

const dd = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  triggerText: { flex: 1, fontFamily: fonts.regular, fontSize: typeScale.body },
  // Floats over the fields below it — absolute, not part of the flow — so
  // opening it never changes the form's own height or spacing.
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 6,
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  // The inline variant — normal flow rather than floating, so a long list
  // (Category, Repeat) is just more of the form's own scrollable content
  // instead of an overlay that can run off the bottom with nothing able to
  // reach the rest of it.
  dropdownInline: {
    marginTop: 6,
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: "hidden",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  optionText: { flex: 1, fontFamily: fonts.bold, fontSize: typeScale.body },
  // The inline date/time wheel that replaces the old nested Modal — floats
  // over whatever's below it, the same as `dropdown` above, rather than
  // pushing every field under it down the form while it's open.
  inlinePicker: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 6,
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  inlineDone: { alignSelf: "stretch", margin: 10, marginTop: 0, borderRadius: 10, padding: 12, alignItems: "center" },
  inlineDoneText: { fontFamily: fonts.bold, fontSize: typeScale.caption, textTransform: "uppercase", letterSpacing: 1 },
});

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (event: NewFlatEvent) => Promise<void>;
  // The flat's existing rows, for the "Your events" section folded away at
  // the bottom — this is also where one gets edited or taken back off the
  // calendar.
  events: FlatEvent[];
  onUpdate: (eventId: string, event: NewFlatEvent) => Promise<void>;
  onDelete: (eventId: string) => Promise<void>;
};

const blankForm = () => ({
  title: "",
  date: new Date(),
  hasEndDate: false,
  endDate: new Date(),
  hasTime: false,
  time: new Date(),
  category: null as EventCategory | null,
  recurrence: null as EventRecurrence | null,
});

// "Add to the calendar" — title, date, an optional time, an optional bill
// category and an optional repeat. Opened by the tab bar's "+" while on Home,
// the one tab the shared calendar lives on. A collapsed list of what's
// already on it sits at the foot of the form; tapping a row there loads it
// back into the same form to edit, rather than a separate screen for it.
export default function AddEventModal({ visible, onClose, onSubmit, onUpdate, events, onDelete }: Props) {
  const { colors, scheme } = useTheme();
  const form = useMemo(() => createFormStyles(colors), [colors]);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date());
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState(new Date());
  // Which date field the picker below is currently standing in for — the
  // start date or the end date share the one picker rather than each
  // carrying its own.
  const [datePickerFor, setDatePickerFor] = useState<"start" | "end" | null>(null);
  const [hasTime, setHasTime] = useState(false);
  const [time, setTime] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  // Which of the Ends/Time/Category/Repeat option lists is open, if any —
  // one shared slot rather than four, so opening one always closes any other
  // that was already open.
  const [openDropdown, setOpenDropdown] = useState<"ends" | "time" | "category" | "repeat" | null>(null);
  const [category, setCategory] = useState<EventCategory | null>(null);
  const [recurrence, setRecurrence] = useState<EventRecurrence | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Collapsed by default — the form itself is what someone opened this for;
  // the list is there to check, edit or tidy up, not the first thing they see.
  const [showConfigured, setShowConfigured] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Which existing row the form is standing in for, if any — swaps the
  // button from "Add event" to "Save changes" and posts to `onUpdate`
  // instead of `onSubmit`.
  const [editingId, setEditingId] = useState<string | null>(null);

  // The one thing every "open a panel" action does first — a dropdown or
  // either native picker taking over means whatever else was open has to go,
  // and this is also what a tap outside all of them (see the backdrop below)
  // closes everything back down to.
  const closePanels = () => {
    setDatePickerFor(null);
    setShowTimePicker(false);
    setOpenDropdown(null);
  };

  const resetForm = () => {
    const blank = blankForm();
    setEditingId(null);
    setTitle(blank.title);
    setDate(blank.date);
    setHasEndDate(blank.hasEndDate);
    setEndDate(blank.endDate);
    setHasTime(blank.hasTime);
    setTime(blank.time);
    setCategory(blank.category);
    setRecurrence(blank.recurrence);
    closePanels();
  };

  useEffect(() => {
    if (!visible) return;
    resetForm();
    setShowConfigured(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Soonest first — the same ordering the calendar box itself reads its
  // "next up" off, so this list and that one agree on what's coming.
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "")),
    [events],
  );

  const valid = !!title.trim();
  const anyPanelOpen = datePickerFor !== null || showTimePicker || openDropdown !== null;

  // Loads an existing row into the form fields above rather than opening a
  // second form — the same fields, just pre-filled and now pointed at
  // `onUpdate` on submit.
  const startEdit = (event: FlatEvent) => {
    setEditingId(event.id);
    setTitle(event.title);
    setDate(fromISODate(event.date) ?? new Date());
    if (event.endDate) {
      setHasEndDate(true);
      setEndDate(fromISODate(event.endDate) ?? new Date());
    } else {
      setHasEndDate(false);
      setEndDate(new Date());
    }
    if (event.time) {
      const [hours, minutes] = event.time.split(":").map(Number);
      const t = new Date();
      t.setHours(hours, minutes, 0, 0);
      setHasTime(true);
      setTime(t);
    } else {
      setHasTime(false);
      setTime(new Date());
    }
    setCategory(event.category);
    setRecurrence(event.recurrence);
    closePanels();
  };

  const handleDelete = async (eventId: string) => {
    if (deletingId) return;
    setDeletingId(eventId);
    try {
      await onDelete(eventId);
      // The form was standing in for the row that just vanished.
      if (editingId === eventId) resetForm();
    } catch (err) {
      console.warn("Failed to delete event", err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const payload: NewFlatEvent = {
        title: title.trim(),
        date: toISODate(date),
        // An end on or before the start isn't a span — the server treats it
        // the same as no end at all, so there's no point sending one.
        endDate: hasEndDate && endDate.getTime() > date.getTime() ? toISODate(endDate) : null,
        time: hasTime ? toTimeString(time) : null,
        recurrence,
        category,
      };
      if (editingId) await onUpdate(editingId, payload);
      else await onSubmit(payload);
      onClose();
    } catch (err) {
      console.warn(editingId ? "Failed to update event" : "Failed to add event", err);
    } finally {
      setSubmitting(false);
    }
  };

  const onAndroidDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    const target = datePickerFor;
    setDatePickerFor(null);
    if (event.type !== "set" || !selected) return;
    if (target === "end") setEndDate(selected);
    else setDate(selected);
  };

  const onAndroidTimeChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShowTimePicker(false);
    if (event.type === "set" && selected) setTime(selected);
  };

  return (
    <>
      <ModalSheet
        visible={visible}
        title={editingId ? "Edit event" : "Add to the calendar"}
        onClose={onClose}
        footer={
          <>
            {editingId && (
              <Pressable style={styles.cancelEditButton} onPress={resetForm} hitSlop={6}>
                <Text style={[styles.cancelEditText, { color: colors.textMuted }]}>Cancel edit</Text>
              </Pressable>
            )}
            <Pressable
              style={[form.primaryButton, (!valid || submitting) && form.primaryButtonDisabled]}
              onPress={handleSubmit}
              disabled={!valid || submitting}
            >
              <Text style={form.primaryButtonText}>{editingId ? "Save changes" : "Add event"}</Text>
            </Pressable>
          </>
        }
      >
        <Text style={form.fieldLabel}>What's it called?</Text>
        <TextInput
          style={form.input}
          placeholder="e.g. Rent due"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />

        {/* One backdrop behind every floating panel below — invisible, but
            catches a tap anywhere else in the form and closes whatever's
            open, rather than requiring the trigger itself to be tapped
            again. Only live (and only drawn above the closed fields, via
            zIndex) while something actually is open. */}
        <View style={{ position: "relative" }}>
          <Pressable
            style={[styles.panelBackdrop, { zIndex: anyPanelOpen ? 20 : -1 }]}
            onPress={closePanels}
            pointerEvents={anyPanelOpen ? "auto" : "none"}
          />

          <Text style={form.fieldLabel}>Date</Text>
          <View style={{ zIndex: datePickerFor === "start" ? 30 : 1 }}>
            <Pressable
              style={[dd.trigger, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              onPress={() => {
                // The title field above is auto-focused, so this is the first
                // thing a finger meets with the keyboard still up — dismissing
                // it explicitly rather than trusting the tap-through means the
                // first tap opens the picker instead of just closing the
                // keyboard.
                Keyboard.dismiss();
                const next = datePickerFor === "start" ? null : "start";
                closePanels();
                if (next) setDatePickerFor(next);
              }}
              accessibilityRole="button"
              accessibilityLabel="Choose date"
            >
              <Text style={[dd.triggerText, { color: colors.text }]}>{formatDateLabel(date)}</Text>
              <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
            </Pressable>

            {/* Inline rather than a second native Modal stacked on top of this
                one — nesting Modals is what made the date picker unreliable in
                the first place, so the wheel now floats over the fields below
                it instead. */}
            {Platform.OS === "ios" && datePickerFor === "start" && (
              <View style={[dd.inlinePicker, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="spinner"
                  themeVariant={scheme}
                  onChange={(_event, selected) => {
                    if (selected) setDate(selected);
                  }}
                />
                <Pressable
                  style={[dd.inlineDone, { backgroundColor: colors.accent }]}
                  onPress={() => setDatePickerFor(null)}
                >
                  <Text style={[dd.inlineDoneText, { color: colors.accentText }]}>Done</Text>
                </Pressable>
              </View>
            )}
          </View>

          <Text style={form.fieldLabel}>Ends</Text>
          <View style={{ zIndex: openDropdown === "ends" || datePickerFor === "end" ? 30 : 1 }}>
            <OptionDropdown
              colors={colors}
              label={hasEndDate ? formatDateLabel(endDate) : "Same day"}
              open={openDropdown === "ends"}
              onOpenChange={(next) => {
                if (next) closePanels();
                setOpenDropdown(next ? "ends" : null);
              }}
              rows={[
                { key: "same", label: "Same day", active: !hasEndDate, onPress: () => setHasEndDate(false) },
                {
                  key: "custom",
                  label: hasEndDate ? formatDateLabel(endDate) : "Custom date",
                  active: hasEndDate,
                  onPress: () => {
                    Keyboard.dismiss();
                    // A blank end otherwise opens sitting before the start —
                    // one day on is a saner starting position than "today".
                    if (!hasEndDate) {
                      setEndDate((prev) => (prev.getTime() > date.getTime() ? prev : addOneDay(date)));
                    }
                    setHasEndDate(true);
                    setDatePickerFor("end");
                  },
                },
              ]}
            />

            {Platform.OS === "ios" && datePickerFor === "end" && (
              <View style={[dd.inlinePicker, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <DateTimePicker
                  value={endDate}
                  mode="date"
                  display="spinner"
                  themeVariant={scheme}
                  onChange={(_event, selected) => {
                    if (selected) setEndDate(selected);
                  }}
                />
                <Pressable
                  style={[dd.inlineDone, { backgroundColor: colors.accent }]}
                  onPress={() => setDatePickerFor(null)}
                >
                  <Text style={[dd.inlineDoneText, { color: colors.accentText }]}>Done</Text>
                </Pressable>
              </View>
            )}
          </View>

          <Text style={form.fieldLabel}>Time</Text>
          <View style={{ zIndex: openDropdown === "time" || showTimePicker ? 30 : 1 }}>
            <OptionDropdown
              colors={colors}
              label={hasTime ? formatTimeLabel(time) : "All day"}
              open={openDropdown === "time"}
              onOpenChange={(next) => {
                if (next) closePanels();
                setOpenDropdown(next ? "time" : null);
              }}
              rows={[
                { key: "allday", label: "All day", active: !hasTime, onPress: () => setHasTime(false) },
                {
                  key: "custom",
                  label: hasTime ? formatTimeLabel(time) : "Custom time",
                  active: hasTime,
                  onPress: () => {
                    Keyboard.dismiss();
                    setHasTime(true);
                    setShowTimePicker(true);
                  },
                },
              ]}
            />

            {Platform.OS === "ios" && showTimePicker && (
              <View style={[dd.inlinePicker, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <DateTimePicker
                  value={time}
                  mode="time"
                  display="spinner"
                  themeVariant={scheme}
                  onChange={(_event, selected) => {
                    if (selected) setTime(selected);
                  }}
                />
                <Pressable
                  style={[dd.inlineDone, { backgroundColor: colors.accent }]}
                  onPress={() => setShowTimePicker(false)}
                >
                  <Text style={[dd.inlineDoneText, { color: colors.accentText }]}>Done</Text>
                </Pressable>
              </View>
            )}
          </View>

          <Text style={form.fieldLabel}>Category</Text>
          <View>
            <OptionDropdown
              colors={colors}
              label={category ? EVENT_CATEGORIES[category].label : "None"}
              open={openDropdown === "category"}
              onOpenChange={(next) => {
                if (next) closePanels();
                setOpenDropdown(next ? "category" : null);
              }}
              variant="inline"
              rows={[
                { key: "none", label: "None", active: category === null, onPress: () => setCategory(null) },
                ...CATEGORY_ORDER.map((c) => ({
                  key: c,
                  label: EVENT_CATEGORIES[c].label,
                  active: category === c,
                  onPress: () => setCategory(c),
                })),
              ]}
            />
          </View>

          <Text style={form.fieldLabel}>Repeat</Text>
          <View>
            <OptionDropdown
              colors={colors}
              label={recurrence ? RECURRENCE_LABELS[recurrence] : "Never"}
              open={openDropdown === "repeat"}
              onOpenChange={(next) => {
                if (next) closePanels();
                setOpenDropdown(next ? "repeat" : null);
              }}
              variant="inline"
              rows={[
                { key: "never", label: "Never", active: recurrence === null, onPress: () => setRecurrence(null) },
                ...RECURRENCE_ORDER.map((r) => ({
                  key: r,
                  label: RECURRENCE_LABELS[r],
                  active: recurrence === r,
                  onPress: () => setRecurrence(r),
                })),
              ]}
            />
          </View>
        </View>

        {sortedEvents.length > 0 && (
          <>
            <Pressable
              style={styles.manageTitleRow}
              onPress={() => setShowConfigured((open) => !open)}
              hitSlop={6}
            >
              <Text style={[styles.manageTitle, { color: colors.text }]}>Your events</Text>
              <Text style={[styles.manageCount, { color: colors.textMuted }]}>{sortedEvents.length}</Text>
              <Ionicons name={showConfigured ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
            </Pressable>

            {showConfigured &&
              sortedEvents.map((event) => (
                <Pressable
                  key={event.id}
                  style={[
                    styles.eventRow,
                    { backgroundColor: colors.surfaceAlt },
                    editingId === event.id && { borderWidth: 1.5, borderColor: colors.accent },
                  ]}
                  onPress={() => startEdit(event)}
                >
                  <View style={styles.flex1}>
                    <Text style={[styles.eventRowTitle, { color: colors.text }]} numberOfLines={1}>
                      {event.title}
                    </Text>
                    <Text style={[styles.eventRowMeta, { color: colors.textMuted }]} numberOfLines={1}>
                      {[
                        formatDateLabel(fromISODate(event.date) ?? new Date()),
                        event.time ? formatEventTime(event.time) : "All day",
                        event.category ? EVENT_CATEGORIES[event.category].label : null,
                        event.recurrence ? recurrenceCaption(event.recurrence) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.iconButton}
                    onPress={() => handleDelete(event.id)}
                    disabled={deletingId !== null}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </Pressable>
              ))}
          </>
        )}
      </ModalSheet>

      {datePickerFor && Platform.OS === "android" && (
        <DateTimePicker
          value={datePickerFor === "end" ? endDate : date}
          mode="date"
          display="default"
          onChange={onAndroidDateChange}
        />
      )}
      {showTimePicker && Platform.OS === "android" && (
        <DateTimePicker value={time} mode="time" display="default" onChange={onAndroidTimeChange} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Invisible catcher spanning the Date-through-Repeat fields — sits above
  // them (see the inline zIndex above) whenever any dropdown or picker is
  // open, so a tap anywhere among the closed fields closes it, while the
  // open panel itself (zIndex 30, higher still) stays tappable on top of it.
  panelBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  // ── The collapsed "Your events" section — the same filing pattern the
  //    Bills tab's own collapsible ledger uses. ──
  flex1: { flex: 1, minWidth: 0 },
  manageTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 22,
    marginBottom: 4,
    paddingVertical: 4,
  },
  manageTitle: { fontFamily: fonts.display, fontSize: typeScale.subheading, letterSpacing: 1 },
  manageCount: { flex: 1, fontFamily: fonts.bold, fontSize: typeScale.caption },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  eventRowTitle: { fontFamily: fonts.bold, fontSize: typeScale.body },
  eventRowMeta: { fontFamily: fonts.regular, fontSize: typeScale.caption, marginTop: 2 },
  iconButton: { padding: 6 },
  cancelEditButton: { alignItems: "center", paddingVertical: 4 },
  cancelEditText: { fontFamily: fonts.bold, fontSize: typeScale.caption, textTransform: "uppercase", letterSpacing: 0.5 },
});
