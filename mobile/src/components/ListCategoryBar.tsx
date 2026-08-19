import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  PanResponder,
  ScrollView,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { hexToRgba } from "../theme/colorMath";
import { fonts } from "../theme/fonts";
import { lockTabSwipe, unlockTabSwipe } from "../navigation/tabSwipeLock";
import type { ShoppingList } from "../types";

// Horizontal spacing between chips. Baked into the drag maths (a chip
// displaces its neighbours by its own width *plus* this), so it has to be a
// constant rather than a style-only `gap`.
const GAP = 8;
// How far the finger travels after a long-press before we read the gesture
// as a reorder rather than a press-and-hold.
const DRAG_SLOP = 4;
// While dragging, being this close to either end of the visible strip pulls
// the strip along — otherwise a chip could never be moved to a position
// that's currently scrolled off-screen.
const AUTO_SCROLL_EDGE = 48;
const AUTO_SCROLL_STEP = 9;
const AUTO_SCROLL_MS = 16;

type Props = {
  lists: ShoppingList[];
  activeListId: string | null;
  onSelect: (listId: string) => void;
  onAdd: () => void;
  /** Long-press-and-release on a chip: open its rename/delete menu. */
  onEdit: (list: ShoppingList) => void;
  /** Drag-committed order. Carries every list id, in the new order. */
  onReorder: (orderedIds: string[]) => void;
};

// The row of list categories under the Shopping List subheading. Chips take
// the same outlined-rounded-rectangle treatment as the chore chips on the
// house cards; the active one fills with the accent. The "+" sits outside
// the scroller so it's always reachable, with the strip fading out beneath
// it once there are more lists than fit.
//
// One gesture does double duty, iOS-style: long-press lifts a chip, then
// moving reorders it and releasing without moving opens its edit menu.
export default function ListCategoryBar({ lists, activeListId, onSelect, onAdd, onEdit, onReorder }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Chip widths can't be known until they've laid out, and every bit of the
  // drag maths is in terms of them, so they're measured and kept by id.
  const widthsRef = useRef<Record<string, number>>({});
  const [measuredAt, setMeasuredAt] = useState(0);

  const scrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const viewportWRef = useRef(0);
  const contentWRef = useRef(0);
  const [overflowing, setOverflowing] = useState(false);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragX = useRef(new Animated.Value(0)).current;
  const liftScale = useRef(new Animated.Value(1)).current;

  // One shift value per chip: how far it slides to open a gap for the chip
  // being dragged. Created lazily so chips added mid-session get one too.
  const shiftsRef = useRef<Record<string, Animated.Value>>({});
  const shiftFor = useCallback((id: string) => {
    if (!shiftsRef.current[id]) shiftsRef.current[id] = new Animated.Value(0);
    return shiftsRef.current[id];
  }, []);

  // Live drag state. Refs rather than state because the pan handlers and the
  // auto-scroll timer both read it every frame.
  const dragRef = useRef({ fromIndex: -1, toIndex: -1, dx: 0, startScrollX: 0, active: false });
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ids = useMemo(() => lists.map((l) => l.id), [lists]);

  // Left edge of each slot, in content coordinates.
  const offsets = useMemo(() => {
    const out: number[] = [];
    let x = 0;
    for (const id of ids) {
      out.push(x);
      x += (widthsRef.current[id] ?? 0) + GAP;
    }
    return out;
    // measuredAt is the signal that widthsRef changed under us.
  }, [ids, measuredAt]);
  const offsetsRef = useRef(offsets);
  offsetsRef.current = offsets;

  const handleChipLayout = useCallback((id: string, e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (widthsRef.current[id] === w) return;
    widthsRef.current[id] = w;
    setMeasuredAt((n) => n + 1);
  }, []);

  const syncOverflow = useCallback(() => {
    setOverflowing(contentWRef.current > viewportWRef.current + 1);
  }, []);

  // Slide every chip between the dragged chip's origin and its current
  // target out of the way by exactly one chip-width, so the gap under the
  // finger is always the right size.
  const applyShifts = useCallback(
    (fromIndex: number, toIndex: number) => {
      const draggedWidth = (widthsRef.current[ids[fromIndex]] ?? 0) + GAP;
      ids.forEach((id, k) => {
        if (k === fromIndex) return;
        let to = 0;
        if (toIndex > fromIndex && k > fromIndex && k <= toIndex) to = -draggedWidth;
        else if (toIndex < fromIndex && k >= toIndex && k < fromIndex) to = draggedWidth;
        Animated.spring(shiftFor(id), {
          toValue: to,
          useNativeDriver: true,
          friction: 14,
          tension: 140,
        }).start();
      });
    },
    [ids, shiftFor],
  );

  // Where the dragged chip's centre currently sits, and therefore which slot
  // it should drop into. Called both from the pan handler and, while the
  // strip is auto-scrolling, from the timer.
  const updateTarget = useCallback(() => {
    const d = dragRef.current;
    if (!d.active) return;
    const from = d.fromIndex;
    const offs = offsetsRef.current;
    const w = widthsRef.current[ids[from]] ?? 0;
    // The strip may have scrolled under the finger since the drag began. The
    // chip lives in content space, so it has to travel that drift on top of
    // the finger's own movement just to stay put on screen — without this it
    // slides out from under the finger every time auto-scroll kicks in.
    const scrollDrift = scrollXRef.current - d.startScrollX;
    dragX.setValue(d.dx + scrollDrift);
    const centre = offs[from] + w / 2 + d.dx + scrollDrift;

    let target = from;
    ids.forEach((id, k) => {
      const slotCentre = offs[k] + (widthsRef.current[id] ?? 0) / 2;
      if (k < from && centre < slotCentre) target = Math.min(target, k);
      if (k > from && centre > slotCentre) target = Math.max(target, k);
    });

    if (target !== d.toIndex) {
      d.toIndex = target;
      applyShifts(from, target);
    }
  }, [ids, applyShifts, dragX]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  }, []);

  const maybeAutoScroll = useCallback(
    (viewportCentre: number) => {
      const maxScroll = Math.max(0, contentWRef.current - viewportWRef.current);
      let dir = 0;
      if (viewportCentre < AUTO_SCROLL_EDGE) dir = -1;
      else if (viewportCentre > viewportWRef.current - AUTO_SCROLL_EDGE) dir = 1;

      if (dir === 0) {
        stopAutoScroll();
        return;
      }
      if (autoScrollRef.current) return;
      autoScrollRef.current = setInterval(() => {
        const next = Math.max(0, Math.min(maxScroll, scrollXRef.current + dir * AUTO_SCROLL_STEP));
        if (next === scrollXRef.current) return;
        scrollXRef.current = next;
        scrollRef.current?.scrollTo({ x: next, animated: false });
        updateTarget();
      }, AUTO_SCROLL_MS);
    },
    [stopAutoScroll, updateTarget],
  );

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const handleDragStart = useCallback(
    (index: number) => {
      dragRef.current = {
        fromIndex: index,
        toIndex: index,
        dx: 0,
        startScrollX: scrollXRef.current,
        active: true,
      };
      dragX.setValue(0);
      setDraggingId(ids[index]);
    },
    [ids, dragX],
  );

  const handleDragMove = useCallback(
    (dx: number) => {
      const d = dragRef.current;
      if (!d.active) return;
      d.dx = dx;
      // updateTarget drives dragX itself, since it's the one place that
      // knows how far the strip has scrolled under the finger.
      updateTarget();

      const offs = offsetsRef.current;
      const w = widthsRef.current[ids[d.fromIndex]] ?? 0;
      const centre = offs[d.fromIndex] + w / 2 + dx + (scrollXRef.current - d.startScrollX);
      maybeAutoScroll(centre - scrollXRef.current);
    },
    [ids, updateTarget, maybeAutoScroll],
  );

  const handleDragEnd = useCallback(() => {
    const d = dragRef.current;
    stopAutoScroll();
    if (!d.active) return;
    const { fromIndex, toIndex } = d;
    d.active = false;

    Animated.spring(liftScale, { toValue: 1, useNativeDriver: true, friction: 9, tension: 120 }).start();

    if (toIndex !== fromIndex && toIndex >= 0) {
      const next = [...ids];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      onReorder(next);
    }

    // The parent re-renders with the committed order, which puts every chip
    // where its shift was already showing it — so clear the offsets in the
    // same tick rather than animating them back and double-counting.
    Object.values(shiftsRef.current).forEach((v) => v.setValue(0));
    dragX.setValue(0);
    setDraggingId(null);
  }, [ids, dragX, liftScale, onReorder, stopAutoScroll]);

  const handleLift = useCallback(() => {
    Animated.spring(liftScale, { toValue: 1.08, useNativeDriver: true, friction: 6, tension: 180 }).start();
  }, [liftScale]);

  const handleLiftCancel = useCallback(() => {
    Animated.spring(liftScale, { toValue: 1, useNativeDriver: true, friction: 9, tension: 120 }).start();
  }, [liftScale]);

  return (
    <View style={styles.section}>
      <Text style={styles.subheading}>List categories</Text>

      <View style={styles.row}>
        {/* Dragging along the strip and swiping to the next tab are the same
            gesture as far as the responder system is concerned, so the strip
            claims it on touch-down — before the tab wrapper is ever asked.
            Covers the chips too, so a reorder drag can't change tab either. */}
        <View
          style={styles.scrollWrap}
          onTouchStart={lockTabSwipe}
          onTouchEnd={unlockTabSwipe}
          onTouchCancel={unlockTabSwipe}
        >
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            // A chip being dragged owns the gesture; letting the strip
            // scroll at the same time fights the finger.
            scrollEnabled={draggingId === null}
            scrollEventThrottle={16}
            onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
              scrollXRef.current = e.nativeEvent.contentOffset.x;
            }}
            onLayout={(e) => {
              viewportWRef.current = e.nativeEvent.layout.width;
              syncOverflow();
            }}
            onContentSizeChange={(w) => {
              contentWRef.current = w;
              syncOverflow();
            }}
            contentContainerStyle={styles.scrollContent}
          >
            {lists.map((list, index) => (
              <CategoryChip
                key={list.id}
                list={list}
                index={index}
                active={list.id === activeListId}
                dragging={list.id === draggingId}
                anyDragging={draggingId !== null}
                translateX={list.id === draggingId ? dragX : shiftFor(list.id)}
                scale={liftScale}
                styles={styles}
                onLayout={handleChipLayout}
                onSelect={() => onSelect(list.id)}
                onLift={handleLift}
                onLiftCancel={handleLiftCancel}
                onMenu={() => onEdit(list)}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
              />
            ))}
            {/* Add button inline with chips */}
            <View style={styles.addChip}>
              <Pressable style={styles.addButton} onPress={onAdd} hitSlop={8} accessibilityLabel="Add list">
                <Ionicons name="add" size={18} color={colors.accentInk} />
              </Pressable>
            </View>
          </ScrollView>

          {/* Only fades once there's actually something running under the
              "+", so a short row doesn't look clipped for no reason. Both
              stops are the page background — see hexToRgba as to why the
              transparent end can't just be rgba(0,0,0,0). */}
          {overflowing && (
            <LinearGradient
              colors={[hexToRgba(colors.bg, 0), colors.bg]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.fade}
              pointerEvents="none"
            />
          )}
        </View>
      </View>
    </View>
  );
}

type ChipProps = {
  list: ShoppingList;
  index: number;
  active: boolean;
  dragging: boolean;
  anyDragging: boolean;
  translateX: Animated.Value;
  scale: Animated.Value;
  styles: ReturnType<typeof createStyles>;
  onLayout: (id: string, e: LayoutChangeEvent) => void;
  onSelect: () => void;
  onLift: () => void;
  onLiftCancel: () => void;
  onMenu: () => void;
  onDragStart: (index: number) => void;
  onDragMove: (dx: number) => void;
  onDragEnd: () => void;
};

function CategoryChip({
  list,
  index,
  active,
  dragging,
  anyDragging,
  translateX,
  scale,
  styles,
  onLayout,
  onSelect,
  onLift,
  onLiftCancel,
  onMenu,
  onDragStart,
  onDragMove,
  onDragEnd,
}: ChipProps) {
  // Long-press arms the chip; whether that turns into a reorder or an edit
  // menu is decided by whether the finger then moves.
  const liftedRef = useRef(false);
  const draggedRef = useRef(false);

  // PanResponder is built once, so it can't close over this render's props.
  const latest = useRef({ index, onDragStart, onDragMove, onDragEnd, onMenu, onLiftCancel });
  latest.current = { index, onDragStart, onDragMove, onDragEnd, onMenu, onLiftCancel };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Never claim on touch-down — that would kill the strip's own
        // scrolling. Only once armed, and only once the finger has moved.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gesture) => {
          if (!liftedRef.current) return false;
          if (Math.abs(gesture.dx) <= DRAG_SLOP) return false;
          // Claiming the responder cancels the Pressable underneath, which
          // fires onPressOut — this flag tells it not to open the menu.
          draggedRef.current = true;
          latest.current.onDragStart(latest.current.index);
          return true;
        },
        onPanResponderMove: (_evt, gesture) => {
          latest.current.onDragMove(gesture.dx);
        },
        onPanResponderRelease: () => {
          liftedRef.current = false;
          latest.current.onDragEnd();
        },
        onPanResponderTerminate: () => {
          liftedRef.current = false;
          latest.current.onDragEnd();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );

  const transform = [{ translateX }, ...(dragging ? [{ scale }] : [])];

  return (
    <Animated.View
      onLayout={(e) => onLayout(list.id, e)}
      style={[
        styles.chipWrap,
        { transform },
        // Lift the dragged chip over its neighbours as they slide past it.
        dragging && styles.chipWrapDragging,
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable
        style={[styles.chip, active && styles.chipActive, dragging && styles.chipDragging]}
        onPress={onSelect}
        // Reordering while a different chip is mid-drag would be ambiguous.
        disabled={anyDragging && !dragging}
        onLongPress={() => {
          liftedRef.current = true;
          draggedRef.current = false;
          onLift();
        }}
        onPressOut={() => {
          // Released without ever moving: this was a press-and-hold, so show
          // the edit menu. A drag has already handled itself in onDragEnd.
          if (liftedRef.current && !draggedRef.current) {
            liftedRef.current = false;
            latest.current.onLiftCancel();
            latest.current.onMenu();
          }
        }}
      >
        <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
          {list.name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    section: { marginBottom: 20 },
    subheading: {
      fontFamily: fonts.bold,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: colors.textMuted,
      marginBottom: 10,
    },
    row: { flexDirection: "row", alignItems: "center" },
    scrollWrap: { flex: 1, minWidth: 0 },
    scrollContent: { flexDirection: "row", gap: GAP, paddingRight: 28, alignItems: "center" },
    // Matches the chore chips on the house cards: no border, tight
    // radius, bold 13.
    chipWrap: { borderRadius: 6 },
    chipWrapDragging: { zIndex: 10, elevation: 10 },
    chip: {
      borderRadius: 6,
      paddingVertical: 5,
      paddingHorizontal: 10,
      backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.accent },
    chipDragging: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 8,
    },
    chipText: {
      fontFamily: fonts.bold,
      fontSize: 13,
      letterSpacing: -0.3,
      color: colors.text,
    },
    chipTextActive: { color: colors.accentText },
    fade: { position: "absolute", right: 0, top: 0, bottom: 0, width: 32 },
    // Inline add button styled as a chip
    addChip: { alignItems: "center", justifyContent: "center" },
    addButton: {
      width: 30,
      height: 30,
      borderRadius: 6,
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}