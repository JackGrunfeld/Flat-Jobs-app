import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Animated, PanResponder } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { onColor, withAlpha, type ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import { lockTabSwipe, unlockTabSwipe } from "../navigation/tabSwipeLock";
import type { FlatMember, ShoppingListItem } from "../types";
import ProfileAvatar from "./ProfileAvatar";

const EDIT_WIDTH = 72;
const DELETE_WIDTH = 72;
// Breathing room between the sliding card and the action boxes, and between
// the two boxes themselves — they read as separate buttons, not one bar.
const ACTION_GAP = 10;
const OPEN_X = -(ACTION_GAP + EDIT_WIDTH + ACTION_GAP + DELETE_WIDTH);
// Past this point on release, the swipe counts as "open" rather than
// snapping back — roughly iMessage's own halfway-ish commit point.
const OPEN_COMMIT_X = OPEN_X * 0.4;
const MAX_VISIBLE_UPVOTERS = 3;
// How long a hold has to sit still before it arms drag-to-move rather than
// just being read as the start of a tap.
const DRAG_LONG_PRESS_MS = 400;
// Once armed (or before a swipe/drag has been decided at all), how far the
// finger has to travel before that reads as movement rather than a still
// finger about to lift off as a tap.
const SLOP = 4;

// The "added by" face on the left of the card, and the smaller ones in the
// upvoter stack. Both are ProfileAvatar, so these are the only sizes the card
// still owns — everything else about how a face is drawn lives in that
// component.
const ADDED_BY_AVATAR_SIZE = 40;
const UPVOTER_AVATAR_SIZE = 16;

type Props = {
  item: ShoppingListItem;
  /** Fills the whole card — one of the dashboard's tones. Every mark on top
   *  is either `fg` (whichever of black/white reads on it) or a translucent
   *  wash of it, so the card needs no outline to hold its shape. */
  tone: string;
  addedBy: FlatMember | undefined;
  upvoters: FlatMember[];
  upvoted: boolean;
  open: boolean;
  /** True while this is the card being held-and-dragged to another spot —
   *  it stays put in the stack (dimmed) while a floating copy follows the
   *  finger, drawn by the screen rather than this card. */
  dragging: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onUpvote: () => void;
  onSwipeOpen: () => void;
  onSwipeClose: () => void;
  /** Hold-and-drag to move this item, in screen (page) coordinates — the
   *  same space the screen's drop-target hit-testing works in. */
  onDragStart: (pageX: number, pageY: number) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (pageX: number, pageY: number) => void;
};

// Small overlapping avatar stack next to the item name showing who's
// upvoted it — same colour+initials treatment as the "added by" avatar,
// just shrunk down and overlapped the way iOS stacks reaction avatars.
function UpvoterStack({
  upvoters,
  total,
  styles,
  fallbackColor,
  fg,
}: {
  upvoters: FlatMember[];
  total: number;
  styles: ReturnType<typeof createStyles>;
  fallbackColor: string;
  fg: string;
}) {
  if (total === 0) return null;
  const visible = upvoters.slice(0, MAX_VISIBLE_UPVOTERS);
  const overflow = total - visible.length;
  return (
    <View style={styles.upvoterStack}>
      {visible.map((m, i) => (
        <View
          key={m.userId}
          style={[styles.upvoterRing, { zIndex: visible.length - i, marginLeft: i === 0 ? 0 : -8 }]}
        >
          <ProfileAvatar
            displayName={m.displayName}
            color={m.color ?? fallbackColor}
            photo={m.photo}
            size={UPVOTER_AVATAR_SIZE}
            fallbackOn={fg}
          />
        </View>
      ))}
      {overflow > 0 && (
        <View style={[styles.upvoterAvatar, styles.upvoterOverflow, { marginLeft: -8 }]}>
          <Text style={[styles.upvoterAvatarText, { color: fg }]}>+{overflow}</Text>
        </View>
      )}
    </View>
  );
}

// One card per list item — avatar of whoever added it on the left, the name
// in the middle (with a small overlapping stack of upvoters' avatars next to
// it), an upvote "^" button just left of the tick box, then the tick box.
//
// One PanResponder does triple duty on the row as a whole: a quick tap
// toggles purchased, a horizontal drag reveals Edit/Delete (iMessage-style),
// and a hold-then-drag lifts the card to move it elsewhere. It claims the
// touch from the moment it starts (rather than waiting to see which of
// those it is) and decides between them itself — a genuine vertical drag
// past a small slop is still handed back to the enclosing ScrollView by RN's
// own responder system, the same as it always has been, so page scrolling
// is unaffected. The nested checkbox/upvote buttons are untouched by any of
// this: a touch starting on them is claimed by them first, as always.
export default function ShoppingItemCard({
  item,
  tone,
  addedBy,
  upvoters,
  upvoted,
  open,
  dragging,
  onToggle,
  onDelete,
  onEdit,
  onUpvote,
  onSwipeOpen,
  onSwipeClose,
  onDragStart,
  onDragMove,
  onDragEnd,
}: Props) {
  const { colors } = useTheme();
  // Black or white, whichever reads on this card's fill — the same call the
  // dashboard's tiles make, so a tone carries its text identically in both
  // places and in either appearance.
  const fg = useMemo(() => onColor(tone), [tone]);
  const styles = useMemo(() => createStyles(colors, tone, fg), [colors, tone, fg]);
  // A flatmate's own colour when they have one; otherwise a wash of the
  // card's foreground, which is a translucent rgba and so takes its ink from
  // the card rather than from `onColor` (which only reads solid hex).
  const avatarColor = addedBy?.color ?? null;

  const translateX = useRef(new Animated.Value(0)).current;
  const currentX = useRef(0);
  const dragStartX = useRef(0);
  // The little "lifted off the stack" scale-up while held, whether or not
  // that hold turns into an actual move.
  const liftScale = useRef(new Animated.Value(1)).current;

  // Everything this gesture needs to remember between callbacks — refs, not
  // state, since PanResponder's own callbacks are created once and read
  // these live rather than closing over a render's props.
  const mode = useRef<"idle" | "swipe" | "drag">("idle");
  const liftedRef = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const id = translateX.addListener(({ value }) => {
      currentX.current = value;
    });
    return () => translateX.removeListener(id);
  }, [translateX]);

  useEffect(() => {
    if (!open && currentX.current !== 0) {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 9, tension: 70 }).start();
    }
  }, [open, translateX]);

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const settleLift = () => {
    Animated.spring(liftScale, { toValue: 1, useNativeDriver: true, friction: 9, tension: 120 }).start();
  };

  const handleTap = () => {
    if (openRef.current) {
      onSwipeClose();
      return;
    }
    onToggle();
  };

  const endGesture = (evt: { nativeEvent: { pageX: number; pageY: number } }, gesture: { dx: number; vx: number }) => {
    clearLongPressTimer();
    if (mode.current === "drag") {
      settleLift();
      onDragEnd(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
    } else if (mode.current === "swipe") {
      const next = Math.min(0, Math.max(OPEN_X, dragStartX.current + gesture.dx));
      const shouldOpen = next < OPEN_COMMIT_X || gesture.vx < -0.5;
      Animated.spring(translateX, { toValue: shouldOpen ? OPEN_X : 0, useNativeDriver: true, friction: 9, tension: 70 }).start();
      if (shouldOpen) onSwipeOpen();
      else onSwipeClose();
    } else if (liftedRef.current) {
      // Held long enough to arm a drag but never actually moved — settle
      // back down without treating it as a tap.
      settleLift();
    } else {
      handleTap();
    }
    liftedRef.current = false;
    mode.current = "idle";
  };

  const panResponder = useRef(
    PanResponder.create({
      // Claims every touch on the row from the start, so it can tell tap,
      // swipe and hold-drag apart itself — a real vertical scroll gesture
      // is still reclaimed by the ScrollView automatically via its own
      // capture handler, same as any control nested in a ScrollView.
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onPanResponderGrant: () => {
        mode.current = "idle";
        liftedRef.current = false;
        dragStartX.current = currentX.current;
        if (!openRef.current) {
          longPressTimer.current = setTimeout(() => {
            liftedRef.current = true;
            Animated.spring(liftScale, { toValue: 1.04, useNativeDriver: true, friction: 6, tension: 180 }).start();
          }, DRAG_LONG_PRESS_MS);
        }
      },
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gesture) => {
        if (mode.current === "drag") {
          onDragMove(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
          return;
        }
        if (mode.current === "swipe") {
          const next = Math.min(0, Math.max(OPEN_X, dragStartX.current + gesture.dx));
          translateX.setValue(next);
          return;
        }
        // Still deciding what this gesture is.
        if (liftedRef.current && (Math.abs(gesture.dx) > SLOP || Math.abs(gesture.dy) > SLOP)) {
          mode.current = "drag";
          onDragStart(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
          return;
        }
        if (!liftedRef.current && Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5) {
          clearLongPressTimer();
          mode.current = "swipe";
          const next = Math.min(0, Math.max(OPEN_X, dragStartX.current + gesture.dx));
          translateX.setValue(next);
        }
      },
      onPanResponderRelease: endGesture,
      // The ScrollView (or anything else) reclaiming the gesture mid-way —
      // most commonly a vertical scroll starting before anything here
      // decided what the touch was. Same cleanup as a normal release.
      onPanResponderTerminate: endGesture,
      onPanResponderTerminationRequest: () => mode.current !== "drag",
    }),
  ).current;

  return (
    <View style={styles.wrap}>
      {/* Hidden while this card is the one being held-and-dragged — its
          floating copy has nothing to reveal these behind, and they'd
          otherwise show through the dimmed card sitting in its place. */}
      {!dragging && (
        <View style={styles.actionsBackground}>
          <Pressable style={styles.editButton} onPress={onEdit} hitSlop={8}>
            <Ionicons name="pencil" size={20} color="#fff" />
            <Text style={styles.deleteText}>Edit</Text>
          </Pressable>
          <Pressable style={styles.deleteButton} onPress={onDelete} hitSlop={8}>
            <Ionicons name="trash" size={20} color="#fff" />
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      )}
      <Animated.View
        style={[
          styles.card,
          { transform: [{ translateX }, { scale: liftScale }] },
          // The dragged item stays in the stack (so the layout doesn't
          // reflow mid-drag) but reads as "lifted out" while its floating
          // copy follows the finger instead.
          dragging && styles.cardDragging,
        ]}
        // Held for as long as any touch is down on the row — a plain tap,
        // a swipe reveal, or a drag are all "this card owns the gesture,
        // not the tab-swipe wrapper around the whole screen".
        onTouchStart={lockTabSwipe}
        onTouchEnd={unlockTabSwipe}
        onTouchCancel={unlockTabSwipe}
        {...panResponder.panHandlers}
      >
        <ProfileAvatar
          displayName={addedBy?.displayName ?? "?"}
          color={avatarColor}
          photo={addedBy?.photo}
          size={ADDED_BY_AVATAR_SIZE}
          fallbackOn={fg}
        />

        <View style={styles.nameArea}>
          <Text style={[styles.name, item.purchased && styles.nameDone]} numberOfLines={2}>
            {item.name}
          </Text>
          <UpvoterStack upvoters={upvoters} total={item.upvoteCount} styles={styles} fallbackColor={colors.accent} fg={fg} />
        </View>

        <Pressable
          style={[styles.upvoteButton, upvoted && styles.upvoteButtonActive]}
          onPress={onUpvote}
          hitSlop={8}
        >
          <Ionicons name="chevron-up" size={16} color={upvoted ? tone : fg} />
          {item.upvoteCount > 0 && (
            <Text style={[styles.upvoteCount, upvoted && styles.upvoteCountActive]}>{item.upvoteCount}</Text>
          )}
        </Pressable>

        <Pressable style={styles.checkboxTouch} onPress={handleTap} hitSlop={10}>
          <View style={[styles.checkbox, item.purchased && styles.checkboxDone]}>
            {item.purchased && <Text style={styles.checkmark}>✓</Text>}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function createStyles(colors: ThemeColors, tone: string, fg: string) {
  return StyleSheet.create({
    wrap: { marginBottom: 12 },
    // Not a single bar behind the card — just the row the two boxes sit in.
    // The gap before the first box (and between the boxes) is what shows the
    // card sliding clear of them rather than butting straight up against them.
    actionsBackground: {
      position: "absolute",
      top: 0,
      bottom: 0,
      right: 0,
      width: ACTION_GAP + EDIT_WIDTH + ACTION_GAP + DELETE_WIDTH,
      flexDirection: "row",
      alignItems: "center",
      gap: ACTION_GAP,
      paddingLeft: ACTION_GAP,
    },
    editButton: {
      width: EDIT_WIDTH,
      alignSelf: "stretch",
      backgroundColor: colors.accent,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
    deleteButton: {
      width: DELETE_WIDTH,
      alignSelf: "stretch",
      backgroundColor: colors.danger,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
    deleteText: { fontFamily: fonts.bold, fontSize: typeScale.caption, color: "#fff" },
    // No outline: the fill is the shape. The dashboard's tiles carry the same
    // soft drop shadow, which is what lifts a light tone off a light page now
    // that there's no border doing it.
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: tone,
      borderRadius: 16,
      padding: 12,
      gap: 8,
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    // Held-and-dragging: this copy stays in its slot (so surrounding rows
    // have something to measure and shift around) but is fully invisible —
    // its floating copy is doing all the showing now, and the screen closes
    // the gap this leaves by shifting the rows after it up to meet it.
    cardDragging: { opacity: 0 },
    nameArea: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
    // Bold, like the tiles' attribution line — the name is the card's one piece
    // of copy, and it has a saturated fill to hold its own against.
    name: { flexShrink: 1, fontFamily: fonts.bold, fontSize: typeScale.body, color: fg },
    nameDone: { textDecorationLine: "line-through", opacity: 0.5 },
    upvoterStack: { flexDirection: "row", alignItems: "center" },
    // Ring only — the face inside it is a ProfileAvatar.
    upvoterRing: {
      borderWidth: 1.5,
      borderColor: tone,
      borderRadius: (UPVOTER_AVATAR_SIZE + 3) / 2,
    },
    upvoterAvatar: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: tone,
      alignItems: "center",
      justifyContent: "center",
    },
    upvoterOverflow: { backgroundColor: withAlpha(fg, 0.16) },
    upvoterAvatarText: { fontFamily: fonts.bold, fontSize: 8 },
    // Recesses rather than outlines, the way the tiles' pill and arrow badge are
    // washes of their own foreground.
    upvoteButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      minWidth: 30,
      height: 28,
      paddingHorizontal: 6,
      borderRadius: 8,
      backgroundColor: withAlpha(fg, 0.16),
    },
    upvoteButtonActive: { backgroundColor: fg },
    upvoteCount: { fontFamily: fonts.bold, fontSize: typeScale.caption, color: fg },
    upvoteCountActive: { color: tone },
    checkboxTouch: { padding: 2 },
    checkbox: {
      width: 26,
      height: 26,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: withAlpha(fg, 0.5),
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxDone: { backgroundColor: fg, borderColor: fg },
    checkmark: { fontFamily: fonts.bold, color: tone, fontSize: typeScale.body },
  });
}
