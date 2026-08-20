import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Animated, PanResponder } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { onColor, withAlpha, type ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import type { FlatMember, ShoppingListItem } from "../types";
import ProfileAvatar from "./ProfileAvatar";

const DELETE_WIDTH = 84;
const OPEN_X = -DELETE_WIDTH;
// Past this point on release, the swipe counts as "open" rather than
// snapping back — roughly iMessage's own halfway-ish commit point.
const OPEN_COMMIT_X = OPEN_X * 0.4;
const MAX_VISIBLE_UPVOTERS = 3;

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
  onToggle: () => void;
  onDelete: () => void;
  onUpvote: () => void;
  onSwipeOpen: () => void;
  onSwipeClose: () => void;
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
// Swipe left, iMessage-style, to reveal a Delete button behind the card;
// `open`/onSwipeOpen/onSwipeClose let the parent keep only one row open.
export default function ShoppingItemCard({
  item,
  tone,
  addedBy,
  upvoters,
  upvoted,
  open,
  onToggle,
  onDelete,
  onUpvote,
  onSwipeOpen,
  onSwipeClose,
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

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_evt, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderGrant: () => {
        dragStartX.current = currentX.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        const next = Math.min(0, Math.max(OPEN_X, dragStartX.current + gesture.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_evt, gesture) => {
        const next = Math.min(0, Math.max(OPEN_X, dragStartX.current + gesture.dx));
        const shouldOpen = next < OPEN_COMMIT_X || gesture.vx < -0.5;
        Animated.spring(translateX, { toValue: shouldOpen ? OPEN_X : 0, useNativeDriver: true, friction: 9, tension: 70 }).start();
        if (shouldOpen) onSwipeOpen();
        else onSwipeClose();
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const handlePress = () => {
    if (open) {
      onSwipeClose();
      return;
    }
    onToggle();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.deleteBackground}>
        <Pressable style={styles.deleteButton} onPress={onDelete} hitSlop={8}>
          <Ionicons name="trash" size={20} color="#fff" />
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <Pressable style={styles.card} onPress={handlePress}>
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

          <Pressable style={styles.checkboxTouch} onPress={handlePress} hitSlop={10}>
            <View style={[styles.checkbox, item.purchased && styles.checkboxDone]}>
              {item.purchased && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </Pressable>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function createStyles(colors: ThemeColors, tone: string, fg: string) {
  return StyleSheet.create({
    wrap: { marginBottom: 12 },
    deleteBackground: {
      position: "absolute",
      top: 0,
      bottom: 0,
      right: 0,
      width: DELETE_WIDTH,
      borderRadius: 16,
      overflow: "hidden",
    },
    deleteButton: {
      flex: 1,
      backgroundColor: colors.danger,
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