import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import * as shoppingListService from "../services/shoppingListService";
import ShoppingItemCard from "../components/ShoppingItemCard";
import AddShoppingItemModal from "../components/AddShoppingItemModal";
import AddItemFab, { FAB_SIZE } from "../components/AddItemFab";
import SettingsButton from "../components/SettingsButton";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import type { FlatMember, ShoppingListItem } from "../types";

const FAB_MARGIN = 16;
// How long a gap between scroll events has to be before we treat the user
// as "stopped" and bring the FAB back — see handleScroll below.
const SCROLL_STOP_DELAY = 150;

// The shared checklist as a stack of cards (avatar of whoever added it, name,
// tick box) with a floating "+" FAB above the tab bar. The FAB drops out of
// view while the list is actively scrolling and reappears once scrolling
// stops or the bottom of the list is reached.
export default function ShoppingScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { userFlat, currentUser } = useAuth();
  const [listItems, setListItems] = useState<ShoppingListItem[]>([]);
  const [addVisible, setAddVisible] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const fabHidden = useRef(new Animated.Value(0)).current; // 0 = shown, 1 = hidden
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const memberById = useMemo(() => new Map((userFlat?.members ?? []).map((m) => [m.userId, m])), [userFlat]);

  // Highest upvotes first — recomputed locally (not just trusted from the
  // server's initial order) so an upvote visibly jumps a card to the top the
  // moment it's tapped, before the request round-trips.
  const sortedItems = useMemo(
    () => [...listItems].sort((a, b) => b.upvoteCount - a.upvoteCount || b.createdAt - a.createdAt),
    [listItems],
  );

  const load = useCallback(async () => {
    if (!userFlat) return;
    const { items } = await shoppingListService.fetchShoppingListItems(userFlat.id);
    setListItems(items);
  }, [userFlat]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Typed-out orange subtitle (same treatment as HomeScreen's nudge line) —
  // retypes whenever the count changes, whether that's the initial load or
  // an item being added/removed while the screen is open.
  const itemsText = `There ${sortedItems.length === 1 ? "is" : "are"} ${sortedItems.length} item${sortedItems.length === 1 ? "" : "s"} in ${userFlat?.name ?? ""}'s list`;
  const [visibleChars, setVisibleChars] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    setVisibleChars(0);
  }, [itemsText]);

  useEffect(() => {
    if (visibleChars >= itemsText.length) return;
    const timer = setTimeout(() => setVisibleChars((c) => c + 1), 45);
    return () => clearTimeout(timer);
  }, [visibleChars, itemsText]);

  useEffect(() => {
    const blink = setInterval(() => setCursorOn((v) => !v), 500);
    return () => clearInterval(blink);
  }, []);

  const showFab = useCallback(() => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }
    Animated.spring(fabHidden, { toValue: 0, useNativeDriver: true, friction: 8, tension: 60 }).start();
  }, [fabHidden]);

  const hideFab = useCallback(() => {
    Animated.timing(fabHidden, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [fabHidden]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const reachedBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 24;

      if (reachedBottom) {
        showFab();
        return;
      }

      hideFab();
      if (stopTimer.current) clearTimeout(stopTimer.current);
      stopTimer.current = setTimeout(showFab, SCROLL_STOP_DELAY);
    },
    [hideFab, showFab],
  );

  if (!userFlat) return null;

  const addListItem = async (name: string) => {
    // A "duplicate" name resolves to the existing item (now with one more
    // vote) instead of a new row — merge it in place rather than prepending.
    const { item } = await shoppingListService.addShoppingListItem(userFlat.id, { name });
    setListItems((prev) => (prev.some((i) => i.id === item.id) ? prev.map((i) => (i.id === item.id ? item : i)) : [item, ...prev]));
  };

  const togglePurchased = async (item: ShoppingListItem) => {
    setListItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, purchased: !i.purchased } : i)));
    await shoppingListService.setShoppingListItemPurchased(userFlat.id, item.id, !item.purchased);
  };

  const toggleUpvote = async (item: ShoppingListItem) => {
    if (!currentUser) return;
    const alreadyUpvoted = item.upvotedByUserIds.includes(currentUser.id);
    setListItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              upvoteCount: i.upvoteCount + (alreadyUpvoted ? -1 : 1),
              upvotedByUserIds: alreadyUpvoted
                ? i.upvotedByUserIds.filter((id) => id !== currentUser.id)
                : [...i.upvotedByUserIds, currentUser.id],
            }
          : i,
      ),
    );
    const { item: updated } = await shoppingListService.toggleShoppingListItemUpvote(userFlat.id, item.id);
    setListItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
  };

  const deleteListItem = async (itemId: string) => {
    setOpenItemId((prev) => (prev === itemId ? null : prev));
    setListItems((prev) => prev.filter((i) => i.id !== itemId));
    await shoppingListService.deleteShoppingListItem(userFlat.id, itemId);
  };

  // This screen's own container already stops right above the tab bar (the
  // tab bar isn't drawn `position: absolute` over it), so "bottom: 0" here
  // is already just above the tabs — no tab bar height to add in.
  const fabBottom = FAB_MARGIN;
  // Distance needed to carry the FAB from its resting spot down past the
  // bottom of the screen (and behind the tab bar) when hidden.
  const fabTranslateY = fabHidden.interpolate({ inputRange: [0, 1], outputRange: [0, fabBottom + FAB_SIZE + 20] });

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: fabBottom + FAB_SIZE + 24 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <Text style={styles.pageTitle}>Shopping List</Text>

        <Text style={styles.nudge}>
          {itemsText.slice(0, visibleChars)}
          <Text style={[styles.cursor, { opacity: cursorOn ? 1 : 0 }]}>▌</Text>
        </Text>

        <View style={styles.divider} />

        {sortedItems.length === 0 && <Text style={styles.emptyText}>Nothing on the list yet.</Text>}
        {sortedItems.map((item) => (
          <ShoppingItemCard
            key={item.id}
            item={item}
            addedBy={memberById.get(item.addedByUserId)}
            upvoters={item.upvotedByUserIds.map((id) => memberById.get(id)).filter((m): m is FlatMember => !!m)}
            upvoted={!!currentUser && item.upvotedByUserIds.includes(currentUser.id)}
            open={openItemId === item.id}
            onToggle={() => togglePurchased(item)}
            onDelete={() => deleteListItem(item.id)}
            onUpvote={() => toggleUpvote(item)}
            onSwipeOpen={() => setOpenItemId(item.id)}
            onSwipeClose={() => setOpenItemId((prev) => (prev === item.id ? null : prev))}
          />
        ))}
      </Animated.ScrollView>

      <AddItemFab bottom={fabBottom} translateY={fabTranslateY} onPress={() => setAddVisible(true)} />
      <AddShoppingItemModal visible={addVisible} onClose={() => setAddVisible(false)} onAdd={addListItem} />
      <SettingsButton />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, paddingHorizontal: 16, backgroundColor: colors.bg },
  pageTitle: {
    fontFamily: fonts.regular,
    fontSize: typeScale.subheading,
    letterSpacing: 3,
    color: colors.textMuted,
    marginBottom: 16,
  },
  nudge: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 0.5,
    color: colors.accent,
  },
  cursor: { fontFamily: fonts.bold, color: colors.accent },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 16,
    marginBottom: 20,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    color: colors.textMuted,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 20,
  },
  });
}
