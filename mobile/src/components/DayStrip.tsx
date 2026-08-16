import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type {
  FlatListProps,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { onColor, withAlpha, CAL_RED } from "../theme/colors";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { weekdayLabel } from "../utils/calendarEvents";
import { lockTabSwipe, unlockTabSwipe } from "../navigation/tabSwipeLock";

// Tiles are a fixed size so the row can be measured rather than laid out:
// `getItemLayout` is what lets the list jump straight to a day without having
// rendered the days in between. The gap lives on the tile as a margin rather
// than in a separator, so STEP stays exactly one tile's pitch.
const TILE_WIDTH = 54;
const TILE_HEIGHT = 82;
const TILE_GAP = 8;
const STEP = TILE_WIDTH + TILE_GAP;

// Days either side of today. Long enough that the wheel can be rolled hard
// without hitting an end, short enough that the whole window is built once on
// mount — the list virtualises, so only the dozen on screen are ever rendered.
const RANGE_DAYS = 180;

// The row is the front of a drum standing on end, turning about a vertical
// axis this far behind the screen. A tile's distance from the middle is how
// far round the drum it has travelled, which is what it's turned by — so the
// tiles either side face away from you rather than tipping over a hump.
//
// The radius is the dial for how tightly the drum curves: smaller turns the
// tiles harder over a shorter distance.
const WHEEL_RADIUS = 240;
// Viewing distance. Lower is a wider lens — the turn gets more dramatic and
// the far edge of a tile shrinks harder as it goes back.
const WHEEL_PERSPECTIVE = 600;
// How far out the drum keeps curving. Past this a tile is clamped, though by
// then it's edge-on and faded to almost nothing anyway.
const WHEEL_SPAN = STEP * 4;
// Sampled across the span rather than interpolated end to end: the drum is
// made of a sine and a cosine, and interpolation between samples is
// straight-line, so it takes enough of them that the flats don't show.
const WHEEL_SAMPLES = [1, 0.75, 0.5, 0.25, 0, -0.25, -0.5, -0.75, -1].map((f) => f * WHEEL_SPAN);
const degrees = (radians: number) => (radians * 180) / Math.PI;
// RN has no translateZ, so the depth a tile picks up as it turns away is drawn
// as the shrink that depth would cause instead.
const depthScale = (depth: number) => WHEEL_PERSPECTIVE / (WHEEL_PERSPECTIVE + depth);

// Today reads bigger than the rest of the row. Scale rather than a wider box,
// so the pitch stays uniform and `getItemLayout` keeps working.
const TODAY_SCALE = 1.1;
// What that scale spills past the slot on each side. The row reserves it as
// height, because the list is a scroller and clips to its own bounds — without
// the slack, growing today just crops its top and bottom off. Derived rather
// than typed in, so changing the scale can't quietly reintroduce the crop.
const TODAY_OVERHANG = Math.ceil((TILE_HEIGHT * (TODAY_SCALE - 1)) / 2) + 1;

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// `Animated.FlatList` is untyped generically, so it's re-typed here against the
// props it's actually given. Needed at all because `Animated.event` can only
// drive the scroll natively through an animated component.
const AnimatedFlatList = Animated.FlatList as unknown as React.ComponentType<
  FlatListProps<Date> & { ref?: React.Ref<FlatList<Date>> }
>;

type Props = {
  selected: Date;
  today: Date;
  onSelect: (date: Date) => void;
  onPreview?: (date: Date) => void;
  /** Colour of the marker under the day number. Null draws nothing. */
  dotFor?: (date: Date) => string | null;
};

// A day picker built as a horizontal drum: days curve away to both sides, the
// wheel rolls on after the finger leaves it, and it clicks onto whichever day
// it comes to rest under the middle. Today is marked separately and set
// larger, so it stays findable once the wheel has been rolled away from it.
export default function DayStrip({ selected, today, onSelect, onPreview, dotFor }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Built off local midnights, and via the day-of-month overflowing rather
  // than by adding milliseconds — the latter drifts by an hour across a DST
  // boundary and would eventually repeat or skip a day.
  const days = useMemo(() => {
    const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - RANGE_DAYS);
    return Array.from(
      { length: RANGE_DAYS * 2 + 1 },
      (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i),
    );
  }, [today]);

  const selectedIndex = useMemo(() => days.findIndex((d) => isSameDay(d, selected)), [days, selected]);
  const centeredIndex = selectedIndex >= 0 ? selectedIndex : RANGE_DAYS;

  const listRef = useRef<FlatList<Date>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const isDraggingRef = useRef(false);
  // The live offset, mirrored into a ref so the centring effect can tell
  // "the selection moved" from "the wheel just told us where it stopped".
  const offset = useRef(0);
  const [width, setWidth] = useState(0);

  // Half a row of empty space at each end, so the first and last days can
  // reach the middle like any other. Sizing the padding this way is also what
  // makes a day's centred scroll offset exactly STEP * index — which in turn
  // is why `snapToInterval` lands on days rather than somewhere between them.
  const sidePad = width > 0 ? (width - TILE_WIDTH) / 2 : 0;
  const offsetForIndex = useCallback((index: number) => STEP * index, []);

  useEffect(() => {
    if (width === 0 || isDraggingRef.current) return;
    const target = offsetForIndex(centeredIndex);
    if (Math.abs(offset.current - target) < 1) return;
    offset.current = target;
    listRef.current?.scrollToOffset({ offset: target, animated: false });
  }, [centeredIndex, width, offsetForIndex]);

  const centre = useCallback((index: number, animated: boolean) => {
    if (index < 0) return;
    listRef.current?.scrollToOffset({ offset: offsetForIndex(index), animated });
  }, [offsetForIndex]);

  // Follows the selection when it's set from outside — a tap on a tile, or
  // anything that moves the day from elsewhere on the screen. Skipped when the
  // wheel is already there, so settling on a day can't yank it back.
  // This intentionally runs without animation when the list first measures, so
  // the strip appears on the selected day immediately rather than blanking until
  // a user scrolls.

  // Whatever the wheel came to rest under the middle becomes the selection.
  // Fires from both the end of a roll and the end of a drag that had no roll
  // in it — a slow release reports only the latter.
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    isDraggingRef.current = false;
    const rawIndex = e.nativeEvent.contentOffset.x / STEP;
    const index = Math.round(rawIndex);
    const landed = days[Math.max(0, Math.min(days.length - 1, index))];
    if (landed && !isSameDay(landed, selected)) onSelect(landed);
    if (landed && onPreview) onPreview(landed);
  };

  const updatePreviewFromOffset = (offsetX: number) => {
    if (!onPreview) return;
    const rawIndex = offsetX / STEP;
    const index = Math.round(rawIndex);
    const preview = days[Math.max(0, Math.min(days.length - 1, index))];
    if (preview) onPreview(preview);
  };

  const renderItem = useCallback(
    ({ item, index }: { item: Date; index: number }) => {
      const isToday = isSameDay(item, today);
      // The fill is the accent, so what's printed on it is whichever of
      // black/white carries against that particular accent.
      const ink = onColor(colors.accent);
      const dot = dotFor?.(item) ?? null;

      // The scroll offset at which this tile sits dead centre. A tile's
      // distance from the middle is that minus the live offset, which is what
      // makes every one of these a plain interpolation of `scrollX`.
      // Descending distance gives ascending offsets, which is the order
      // `interpolate` requires of its input range.
      const inputRange = WHEEL_SAMPLES.map((d) => STEP * index - d);
      const clamp = { inputRange, extrapolate: "clamp" as const };

      // How far this tile is *the* middle one, 1 at dead centre and 0 a whole
      // day either side. Driven by the scroll rather than by which day is
      // selected, so the highlight travels with the wheel while it's rolling
      // instead of staying behind on the day it left.
      const neighbours = {
        inputRange: [STEP * (index - 1), STEP * index, STEP * (index + 1)],
        extrapolate: "clamp" as const,
      };
      const middle = scrollX.interpolate({ ...neighbours, outputRange: [0, 1, 0] });
      const offMiddle = scrollX.interpolate({ ...neighbours, outputRange: [1, 0, 1] });

      // Two copies of the face, cross-faded. A Text colour can't be animated
      // on the native driver, but stacked opacities can — so the tile carries
      // both an on-surface and an on-accent version and dissolves between them.
      const face = (live: boolean) => (
        <>
          {/* Today prints in the calendar's red rather than the muted grey the
              rest of the row uses — one of three things marking it, along with
              the tint and the scale. */}
          <Text
            style={[
              styles.weekday,
              { color: live ? withAlpha(ink, 0.75) : isToday ? CAL_RED : colors.textMuted },
            ]}
          >
            {weekdayLabel(item)}
          </Text>
          <View style={styles.numberWrap}>
            <Text style={[styles.number, { color: live ? ink : isToday ? CAL_RED : colors.text }]}>
              {item.getDate()}
            </Text>
          </View>
          {/* Always reserved, drawn or not, so a day without a marker is the
              same height as one with it. */}
          <View style={styles.dotSlot}>{dot && <View style={[styles.dot, { backgroundColor: dot }]} />}</View>
        </>
      );

      return (
        <Animated.View
          style={[
            styles.slot,
            {
              opacity: scrollX.interpolate({
                ...clamp,
                outputRange: WHEEL_SAMPLES.map((d) => 1 - Math.min(Math.abs(d) / WHEEL_SPAN, 1) * 0.65),
              }),
              transform: [
                { perspective: WHEEL_PERSPECTIVE },
                {
                  // The drum is narrower than the flat row it's laid out as,
                  // so each tile is pulled in to where its own arc puts it.
                  translateX: scrollX.interpolate({
                    ...clamp,
                    outputRange: WHEEL_SAMPLES.map((d) => WHEEL_RADIUS * Math.sin(d / WHEEL_RADIUS) - d),
                  }),
                },
                {
                  // Turned by however far round the drum it has gone, which
                  // sends its outer edge away from you.
                  rotateY: scrollX.interpolate({
                    ...clamp,
                    outputRange: WHEEL_SAMPLES.map((d) => `${degrees(d / WHEEL_RADIUS).toFixed(3)}deg`),
                  }),
                },
                {
                  scale: scrollX.interpolate({
                    ...clamp,
                    outputRange: WHEEL_SAMPLES.map((d) =>
                      depthScale(WHEEL_RADIUS * (1 - Math.cos(d / WHEEL_RADIUS))),
                    ),
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            onPress={() => onSelect(item)}
            style={styles.press}
            accessibilityRole="button"
            accessibilityState={{ selected: isSameDay(item, selected) }}
            accessibilityLabel={item.toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          >
            {/* Scale, so growing today doesn't shove its neighbours along. */}
            <View style={[styles.tile, isToday && styles.tileToday]}>
              <Animated.View
                style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: middle }]}
              />
              <Animated.View style={[styles.face, { opacity: offMiddle }]}>{face(false)}</Animated.View>
              <Animated.View style={[styles.face, { opacity: middle }]}>{face(true)}</Animated.View>
            </View>
          </Pressable>
        </Animated.View>
      );
    },
    [colors, dotFor, onPreview, onSelect, scrollX, selected, styles, today],
  );

  const onWrapLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    // Claims the drag for the wheel the instant a finger lands, so the tab
    // swipe underneath stands down before it is ever asked. Touch start rather
    // than scroll start: the scroller only reports a drag once it has decided
    // one is happening, by which point the tab wrapper may already have taken
    // the gesture.
    <View
      style={styles.wrap}
      onLayout={onWrapLayout}
      onTouchStart={lockTabSwipe}
      onTouchEnd={unlockTabSwipe}
      onTouchCancel={unlockTabSwipe}
    >
      <AnimatedFlatList
        ref={listRef}
        data={days}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.toDateString()}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({ length: STEP, offset: STEP * index + sidePad, index })}
        // Render immediately so the list never flashes in late on first load.
        // Once measured, we re-center it to the active day without animating.
        contentOffset={{ x: width > 0 ? offsetForIndex(centeredIndex) : 0, y: 0 }}
        // Snap points a day apart, but nothing capping how many of them a
        // throw can carry through: a hard swipe rolls the wheel on and lets
        // it wind down, and the snap only takes hold as it comes to rest.
        // (`disableIntervalMomentum` would pin every throw to the very next
        // day, which is what stops a wheel feeling like one.)
        snapToInterval={STEP}
        snapToAlignment="start"
        decelerationRate="normal"
        onScrollBeginDrag={() => {
          isDraggingRef.current = true;
        }}
        onMomentumScrollBegin={() => {
          isDraggingRef.current = true;
        }}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        onScroll={
          Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: true,
            // Native drives the drum; this only mirrors the offset into a
            // ref for the centring effect above.
            listener: (e) => {
              const nextOffset = (e as NativeSyntheticEvent<NativeScrollEvent>).nativeEvent.contentOffset.x;
              offset.current = nextOffset;
              if (isDraggingRef.current) updatePreviewFromOffset(nextOffset);
            },
          }) as unknown as FlatListProps<Date>["onScroll"]
        }
        scrollEventThrottle={16}
        onScrollToIndexFailed={({ index }) => {
          listRef.current?.scrollToOffset({ offset: offsetForIndex(index), animated: false });
        }}
        contentContainerStyle={[styles.content, { paddingHorizontal: sidePad }]}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Bleeds to the screen edges so tiles turn away at the margins rather than
    // stopping short of them. Fixed height because the list inside is mounted
    // a frame late, and the page shouldn't jump when it arrives — with the
    // overhang added so today's larger tile has somewhere to grow into.
    wrap: { marginHorizontal: -20, marginBottom: 10, height: TILE_HEIGHT + TODAY_OVERHANG * 2 },
    // Centres the slots in that taller row, so the slack sits evenly above and
    // below rather than all of it landing under the tiles.
    content: { alignItems: "center" },
    // The layout box the drum is applied to. Today's own scale sits on the
    // tile inside it, so the two can't fight over one transform.
    slot: { width: TILE_WIDTH, height: TILE_HEIGHT, marginRight: TILE_GAP },
    press: { width: "100%", height: "100%" },
    tile: {
      width: "100%",
      height: "100%",
      borderRadius: 16,
      backgroundColor: colors.surfaceAlt,
      // Clips the highlight to the tile's corners — it's a plain fill behind
      // the face rather than a rounded box of its own.
      overflow: "hidden",
    },
    // Tinted and enlarged. The tint survives the tile becoming the middle one,
    // because the highlight fill is clipped to the content box and so paints
    // inside it rather than over it — meaning today stays identifiable as
    // today even while it's the selected day.
    tileToday: {
      backgroundColor: colors.accentSoft,
      transform: [{ scale: TODAY_SCALE }],
    },
    // Both copies of the face are stacked in the same place, so only their
    // opacities differ and nothing shifts as one gives way to the other.
    face: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },
    weekday: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1 },
    numberWrap: {
      minWidth: 28,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 8,
      alignItems: "center",
    },
    number: { fontFamily: fonts.display, fontSize: 19 },
    dotSlot: { height: 6, justifyContent: "center" },
    dot: { width: 6, height: 6, borderRadius: 3 },
  });
}
