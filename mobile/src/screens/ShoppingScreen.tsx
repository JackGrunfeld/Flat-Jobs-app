import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBarSpace } from "../navigation/FlatTabBar";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import * as shoppingListService from "../services/shoppingListService";
import ShoppingItemCard from "../components/ShoppingItemCard";
import AddShoppingItemModal from "../components/AddShoppingItemModal";
import SettingsButton from "../components/SettingsButton";
import { useRegisterAddAction } from "../navigation/AddActionContext";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import type { FlatMember, ShoppingListItem } from "../types";

// The shared checklist as a stack of cards (avatar of whoever added it, name,
// tick box). Adding is driven by the tab bar's centre "+", which this screen
// registers a handler for — there's no FAB of its own any more.
export default function ShoppingScreen() {
  const insets = useSafeAreaInsets();
  // The tab bar floats over the page, so the last row needs
  // somewhere to scroll clear to.
  const tabBarSpace = useTabBarSpace();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { userFlat, currentUser } = useAuth();
  const [listItems, setListItems] = useState<ShoppingListItem[]>([]);
  const [addVisible, setAddVisible] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

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

  useRegisterAddAction("Shopping", () => setAddVisible(true));

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

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: tabBarSpace }}
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
      </ScrollView>

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
