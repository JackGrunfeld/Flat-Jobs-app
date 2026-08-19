import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBarSpace } from "../navigation/FlatTabBar";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import * as shoppingListService from "../services/shoppingListService";
import ShoppingItemCard from "../components/ShoppingItemCard";
import AddShoppingItemModal from "../components/AddShoppingItemModal";
import ListCategoryBar from "../components/ListCategoryBar";
import ListCategoryModal from "../components/ListCategoryModal";
import RevealTile from "../components/RevealTile";
import SettingsButton, { HEADER_TITLE_TOP } from "../components/SettingsButton";
import { useRegisterAddAction } from "../navigation/AddActionContext";
import { useTheme } from "../context/ThemeContext";
import { CARD_TONES, type ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import type { FlatMember, ShoppingList, ShoppingListItem } from "../types";

// The shared checklist as a stack of cards (avatar of whoever added it, name,
// tick box). Adding is driven by the tab bar's centre "+" which this screen
// registers a handler for — there's no FAB of its own any more.
// The dashboard's own card colours, reused as the list's fills so the two
// screens read as one palette. Taken from CARD_TONES rather than copied, so
// a change to the tiles carries through here.
const ITEM_TONES = Object.values(CARD_TONES);

// Which tone an item wears, from its id rather than its position: the list
// re-sorts as things get ticked off, and a colour that changed underneath you
// on every tap would read as a different item.
function toneFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ITEM_TONES[hash % ITEM_TONES.length];
}

// Matches the cadence on Home, Bills and Chores: one step between blocks,
// with the per-item stagger capped so a long list's last card doesn't wait
// seconds to show up.
const REVEAL_STEP = 60;
const MAX_STAGGER = 6;

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
  // The checklist is split into named lists; only the active one is shown.
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [listModalVisible, setListModalVisible] = useState(false);
  // null while the modal is being used to create rather than edit.
  const [editingList, setEditingList] = useState<ShoppingList | null>(null);

  const activeList = useMemo(() => lists.find((l) => l.id === activeListId) ?? null, [lists, activeListId]);

  const memberById = useMemo(() => new Map((userFlat?.members ?? []).map((m) => [m.userId, m])), [userFlat]);

  // Highest upvotes first — recomputed locally (not just trusted from the
  // server's initial order) so an upvote visibly jumps a card to the top the
  // moment it's tapped, before the request round-trips.
  const sortedItems = useMemo(
    () => [...listItems].sort((a, b) => b.upvoteCount - a.upvoteCount || b.createdAt - a.createdAt),
    [listItems],
  );

  // The lists come first: which one is active decides which items to ask
  // for. The API guarantees at least one (it creates the default "Shopping"
  // on read), so `lists[0]` is a safe landing spot.
  const loadLists = useCallback(async () => {
    if (!userFlat) return;
    const { lists: fetched } = await shoppingListService.fetchShoppingLists(userFlat.id);
    setLists(fetched);
    setActiveListId((prev) => (prev && fetched.some((l) => l.id === prev) ? prev : (fetched[0]?.id ?? null)));
  }, [userFlat]);

  const loadItems = useCallback(async () => {
    if (!userFlat || !activeListId) return;
    const { items } = await shoppingListService.fetchShoppingListItems(userFlat.id, activeListId);
    setListItems(items);
  }, [userFlat, activeListId]);

  useFocusEffect(
    useCallback(() => {
      loadLists();
    }, [loadLists]),
  );

  // Re-runs whenever the active list changes, so switching category swaps
  // the items underneath without needing its own handler.
  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useRegisterAddAction("Shopping", () => setAddVisible(true));

  if (!userFlat) return null;

  const addListItem = async (name: string) => {
    if (!activeListId) return;
    // A "duplicate" name resolves to the existing item (now with one more
    // vote) instead of a new row — merge it in place rather than prepending.
    const { item } = await shoppingListService.addShoppingListItem(userFlat.id, { name, listId: activeListId });
    setListItems((prev) => (prev.some((i) => i.id === item.id) ? prev.map((i) => (i.id === item.id ? item : i)) : [item, ...prev]));
  };

  const selectList = (listId: string) => {
    if (listId === activeListId) return;
    // Clear rather than leaving the old list's items showing while the new
    // ones load — they'd read as belonging to the list just tapped.
    setListItems([]);
    setOpenItemId(null);
    setActiveListId(listId);
  };

  const openNewListModal = () => {
    setEditingList(null);
    setListModalVisible(true);
  };

  const openEditListModal = (list: ShoppingList) => {
    setEditingList(list);
    setListModalVisible(true);
  };

  const submitList = async (name: string) => {
    if (editingList) {
      await shoppingListService.renameShoppingList(userFlat.id, editingList.id, name);
      setLists((prev) => prev.map((l) => (l.id === editingList.id ? { ...l, name } : l)));
      return;
    }
    // A new list lands on the end of the bar and becomes the active one, so
    // whatever prompted creating it can be added straight away.
    const { list } = await shoppingListService.createShoppingList(userFlat.id, name);
    setLists((prev) => [...prev, list]);
    selectList(list.id);
  };

  const removeList = async () => {
    if (!editingList) return;
    const removedId = editingList.id;
    await shoppingListService.deleteShoppingList(userFlat.id, removedId);
    const remaining = lists.filter((l) => l.id !== removedId);
    setLists(remaining);
    if (activeListId === removedId) {
      setListItems([]);
      setActiveListId(remaining[0]?.id ?? null);
    }
  };

  const reorderLists = async (orderedIds: string[]) => {
    const byId = new Map(lists.map((l) => [l.id, l]));
    const reordered = orderedIds.flatMap((id, i) => {
      const list = byId.get(id);
      return list ? [{ ...list, position: i }] : [];
    });
    // Applied straight away — the bar has already animated the chips into
    // this order, so waiting on the round-trip would snap them back.
    setLists(reordered);
    try {
      await shoppingListService.reorderShoppingLists(userFlat.id, orderedIds);
    } catch (err) {
      console.warn("Failed to save list order", err);
      loadLists();
    }
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

  const clearList = () => {
    if (!activeListId || sortedItems.length === 0) return;
    Alert.alert(
      "Clear shopping list?",
      "This removes every item from the list and lets your flatmates know it's done.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear list",
          style: "destructive",
          onPress: async () => {
            await shoppingListService.clearShoppingList(userFlat.id, activeListId);
            setListItems([]);
            setOpenItemId(null);
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top + HEADER_TITLE_TOP, paddingBottom: tabBarSpace }}
      >
        <Text style={styles.pageTitle}>Shopping List</Text>

        <RevealTile delay={0}>
          <ListCategoryBar
            lists={lists}
            activeListId={activeListId}
            onSelect={selectList}
            onAdd={openNewListModal}
            onEdit={openEditListModal}
            onReorder={reorderLists}
          />
        </RevealTile>

        {sortedItems.length === 0 && <Text style={styles.emptyText}>Nothing on this list yet.</Text>}
        {sortedItems.map((item, index) => (
          <RevealTile key={item.id} delay={REVEAL_STEP * (1 + Math.min(index, MAX_STAGGER))}>
            <ShoppingItemCard
              item={item}
              tone={toneFor(item.id)}
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
          </RevealTile>
        ))}

        {sortedItems.length > 0 && (
          <Pressable style={styles.clearButton} onPress={clearList} hitSlop={8}>
            <Text style={styles.clearButtonText}>Clear list</Text>
          </Pressable>
        )}
      </ScrollView>

      <AddShoppingItemModal visible={addVisible} onClose={() => setAddVisible(false)} onAdd={addListItem} />
      <ListCategoryModal
        visible={listModalVisible}
        list={editingList}
        canDelete={lists.length > 1}
        onClose={() => setListModalVisible(false)}
        onSubmit={submitList}
        onDelete={removeList}
      />
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
      fontSize: 28,
      letterSpacing: -0.7,
      // Explicit, and the same 31pt the home greeting uses: the line box is
      // what fixes where the title sits, so every tab's title lands on the
      // same height and the settings gear centres on all of them alike.
      lineHeight: 31,
      color: colors.textMuted,
      // Clears the gear button pinned in the corner.
      paddingRight: 36,
      marginBottom: 8,
    },
    emptyText: {
      fontFamily: fonts.regular,
      fontSize: typeScale.body,
      color: colors.textMuted,
      fontStyle: "italic",
      textAlign: "center",
      marginTop: 20,
    },
    // The bills tab's "Remind" / "Settle up" treatment: a small solid rect in
    // the strongest ink available, rather than the muted outline pill this
    // used to be. There the fill is the card's ink on the card's colour; here
    // the button sits on the page, so the page's own text/background pair is
    // the same relationship.
    clearButton: {
      alignSelf: "center",
      marginTop: 16,
      marginBottom: 8,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: colors.text,
    },
    clearButtonText: {
      fontFamily: fonts.bold,
      fontSize: 11,
      letterSpacing: 0.4,
      color: colors.bg,
    },
  });
}
