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
const TILE_WIDTH = 44;
const TILE_HEIGHT = 56;
const TILE_GAP = 14;
const STEP = TILE_WIDTH + TILE_GAP;

// Days either side of today. Long enough that the wheel can be rolled hard
// without hitting an end, short enough that the whole window is built once on
// mount — the list virtualises, so only the dozen on screen are ever rendered.
const RANGE_DAYS = 180;

// The row is the front of a drum standing on end, turning about a vertical
// axis behind the screen. A tile's distance from the middle is arc length
// along that drum, so it is turned by however far round it has travelled —
// the tiles either side face away from you rather than tipping over a hump.

// How far round a tile is allowed to get before the drum stops curving. Short
// of edge-on, and deliberately: a tile is a flat chord across the circle, not
// a curved segment of it, so as two neighbours approach edge-on their chords
// run into one another and the faces visibly overlap. Stopping the turn here
// keeps every pair clear of the next all the way to the rim.
const MAX_TURN = (55 * Math.PI) / 180;
// Viewing distance — a long lens. It has to be long, because the perspective
// divide shrinks a tile's *position* faster than it shrinks the tile itself,
// and the difference comes out of the 14px of pitch the row has spare. A
// short lens spends that slack before the tiles have finished turning, and
// they overlap near the rim however tight or loose the drum is.
const WHEEL_PERSPECTIVE = 1600;
// Sampled across the span rather than interpolated end to end: the drum is
// made of a sine and a cosine, and interpolation between samples is
// straight-line, so it takes enough of them that the flats don't show. The
// count is what it is because the tiles bunch up towards the rim, where a
// coarse sampling reads as them jumping between positions.
const WHEEL_SAMPLE_COUNT = 17;

const degrees = (radians: number) => (radians * 180) / Math.PI;

type Wheel = {
  /** Arc distances the interpolations are sampled at, furthest first. */
  samples: number[];
  /** How far round the drum, unsigned and clamped at MAX_TURN. */
  angle: (d: number) => number;
  /** Projected x, relative to the flat position the row laid the tile out at. */
  shift: (d: number) => number;
  scale: (d: number) => number;
  opacity: (d: number) => number;
};

// The drum is sized to the row it is given rather than to a constant, so its
// widest point lands exactly on the edge of the strip — and the strip is the
// width of the chore cards below it, so wheel and cards line up.
//
// Solving for the radius rather than picking one: a tile at MAX_TURN sits at
// R·sin(MAX_TURN), divided down by the depth it has gone back, and that has
// to come out at half the row's width. Rearranged for R, that is the
// expression below.
function buildWheel(width: number): Wheel {
  const half = Math.max(width, 1) / 2;
  const P = WHEEL_PERSPECTIVE;
  const cosMax = Math.cos(MAX_TURN);
  const denominator = P * Math.sin(MAX_TURN) - half * (1 - cosMax);
  // Only goes non-positive for a row wider than the lens is long, which the
  // fallback covers rather than letting it yield a negative radius.
  const radius = denominator > 0 ? (half * P) / denominator : half;
  const span = radius * MAX_TURN;

  const angle = (d: number) => Math.min(Math.abs(d), span) / radius;
  // RN has no translateZ, so the depth a tile picks up as it turns away is
  // drawn as the shrink that depth would cause instead.
  const scale = (d: number) => P / (P + radius * (1 - Math.cos(angle(d))));
  // The same divide has to be applied to *where* a tile is, not just to how
  // big it is. Projecting the size without projecting the position is what
  // makes a drum read as a flat fan of turned cards: the tiles shrink as
  // though receding, but stay out at the width they had when they were flat.
  const x = (d: number) => Math.sign(d) * radius * Math.sin(angle(d)) * scale(d);

  return {
    samples: Array.from(
      { length: WHEEL_SAMPLE_COUNT },
      (_, i) => span * (1 - (2 * i) / (WHEEL_SAMPLE_COUNT - 1)),
    ),
    angle,
    scale,
    shift: (d) => x(d) - d,
    // Goes out with the turn rather than with raw distance, and normalised so
    // it reaches nothing exactly at MAX_TURN — which is where the geometry
    // clamps. A tile frozen at the rim is therefore already invisible, so the
    // clamp never shows as a pile-up. The power lifts the middle of the range
    // so the days just either side of the selection stay readable.
    opacity: (d) => Math.max((Math.cos(angle(d)) - cosMax) / (1 - cosMax), 0) ** 0.75,
  };
}

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
  const wheel = useMemo(() => buildWheel(width), [width]);
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
      const inputRange = wheel.samples.map((d) => STEP * index - d);
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
                outputRange: wheel.samples.map(wheel.opacity),
              }),
              transform: [
                { perspective: WHEEL_PERSPECTIVE },
                {
                  // The drum is narrower than the flat row it's laid out as,
                  // so each tile is pulled in to where its own arc puts it.
                  translateX: scrollX.interpolate({
                    ...clamp,
                    outputRange: wheel.samples.map(wheel.shift),
                  }),
                },
                {
                  // Turned by however far round the drum it has gone, which
                  // sends its outer edge away from you.
                  rotateY: scrollX.interpolate({
                    ...clamp,
                    outputRange: wheel.samples.map((d) => `${degrees(Math.sign(d) * wheel.angle(d)).toFixed(3)}deg`),
                  }),
                },
                {
                  scale: scrollX.interpolate({
                    ...clamp,
                    outputRange: wheel.samples.map(wheel.scale),
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
    [colors, dotFor, onSelect, scrollX, selected, styles, today, wheel],
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
    // Left at the content width rather than bled past it: the drum is sized to
    // whatever row it is given, so its widest point lands on this box's edge —
    // and this box is the chore cards' width, so the two line up. Fixed height because the list inside is mounted
    // a frame late, and the page shouldn't jump when it arrives — with the
    // overhang added so today's larger tile has somewhere to grow into.
    wrap: { marginBottom: 10, height: TILE_HEIGHT + TODAY_OVERHANG * 2 },
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
      borderRadius: 12,
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
    weekday: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1, marginTop: 10 },
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
