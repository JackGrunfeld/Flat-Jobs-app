import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Animated, PanResponder } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import { initialsFor } from "../utils/initials";
import type { FlatMember, ShoppingListItem } from "../types";

const DELETE_WIDTH = 84;
const OPEN_X = -DELETE_WIDTH;
// Past this point on release, the swipe counts as "open" rather than
// snapping back — roughly iMessage's own halfway-ish commit point.
const OPEN_COMMIT_X = OPEN_X * 0.4;
const MAX_VISIBLE_UPVOTERS = 3;

type Props = {
  item: ShoppingListItem;
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
}: {
  upvoters: FlatMember[];
  total: number;
  styles: ReturnType<typeof createStyles>;
  fallbackColor: string;
}) {
  if (total === 0) return null;
  const visible = upvoters.slice(0, MAX_VISIBLE_UPVOTERS);
  const overflow = total - visible.length;
  return (
    <View style={styles.upvoterStack}>
      {visible.map((m, i) => (
        <View
          key={m.userId}
          style={[styles.upvoterAvatar, { backgroundColor: m.color ?? fallbackColor, zIndex: visible.length - i, marginLeft: i === 0 ? 0 : -8 }]}
        >
          <Text style={styles.upvoterAvatarText}>{initialsFor(m.displayName)}</Text>
        </View>
      ))}
      {overflow > 0 && (
        <View style={[styles.upvoterAvatar, styles.upvoterOverflow, { marginLeft: -8 }]}>
          <Text style={styles.upvoterAvatarText}>+{overflow}</Text>
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
  const styles = useMemo(() => createStyles(colors), [colors]);
  const avatarColor = addedBy?.color ?? colors.accent;

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
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarText}>{initialsFor(addedBy?.displayName ?? "?")}</Text>
          </View>

          <View style={styles.nameArea}>
            <Text style={[styles.name, item.purchased && styles.nameDone]} numberOfLines={2}>
              {item.name}
            </Text>
            <UpvoterStack upvoters={upvoters} total={item.upvoteCount} styles={styles} fallbackColor={colors.accent} />
          </View>

          <Pressable
            style={[styles.upvoteButton, upvoted && styles.upvoteButtonActive]}
            onPress={onUpvote}
            hitSlop={8}
          >
            <Ionicons name="chevron-up" size={16} color={upvoted ? colors.accentText : colors.textMuted} />
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

function createStyles(colors: ThemeColors) {
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
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: fonts.bold, fontSize: typeScale.caption, color: "rgba(0,0,0,0.75)" },
  nameArea: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  name: { flexShrink: 1, fontFamily: fonts.regular, fontSize: typeScale.body, color: colors.text },
  nameDone: { textDecorationLine: "line-through", opacity: 0.5 },
  upvoterStack: { flexDirection: "row", alignItems: "center" },
  upvoterAvatar: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  upvoterOverflow: { backgroundColor: colors.surfaceAlt },
  upvoterAvatarText: { fontFamily: fonts.bold, fontSize: 8, color: "rgba(0,0,0,0.75)" },
  upvoteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minWidth: 30,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  upvoteButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  upvoteCount: { fontFamily: fonts.bold, fontSize: typeScale.caption, color: colors.textMuted },
  upvoteCountActive: { color: colors.accentText },
  checkboxTouch: { padding: 2 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.inputBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: { backgroundColor: colors.accent, borderColor: colors.accent },
    checkmark: { fontFamily: fonts.bold, color: colors.accentText, fontSize: typeScale.body },
  });
}
