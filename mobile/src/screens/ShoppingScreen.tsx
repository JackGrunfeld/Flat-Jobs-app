import React, { useCallback, useMemo, useRef, useState } from "react";
import { Animated, View, Text, StyleSheet, ScrollView, Pressable, Alert, LayoutAnimation } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTabBarSpace } from "../navigation/FlatTabBar";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useAuth } from "../context/AuthContext";
import * as shoppingListService from "../services/shoppingListService";
import ShoppingItemCard from "../components/ShoppingItemCard";
import AddShoppingItemModal from "../components/AddShoppingItemModal";
import ListCategoryBar from "../components/ListCategoryBar";
import ListCategoryModal from "../components/ListCategoryModal";
import RevealTile from "../components/RevealTile";
import { useTabsHeaderSpace } from "../components/TabsHeader";
import { useRegisterAddAction, useAddAction } from "../navigation/AddActionContext";
import type { MainTabParamList } from "../navigation/MainTabNavigator";
import { useTabBarBubble } from "../navigation/TabBarBubbleContext";
import { markShoppingSeen } from "../storage/notificationSeen";
import { useTheme } from "../context/ThemeContext";
import { CARD_TONES, type ThemeColors } from "../theme/colors";
import { hexToRgba } from "../theme/colorMath";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import type { FlatMember, ShoppingList, ShoppingListItem } from "../types";

// How tall the fade under the fixed header is — content scrolling up dims
// out across this band instead of vanishing the instant it reaches the
// header's hard edge.
const HEADER_FADE_HEIGHT = 24;

type Nav = BottomTabNavigationProp<MainTabParamList>;

// How long a partial tick (some, not all, of a list's items checked off) has
// to sit still before it's read as "done shopping for this" rather than
// mid-tap — long enough that ticking off the rest of the list doesn't get
// interrupted by a bubble popping up under a moving thumb.
const LOG_EXPENSE_PROMPT_DELAY = 1000;

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
  // The tab bar floats over the page, so the last row needs
  // somewhere to scroll clear to. TabsHeader floats over the top the same
  // way, so the first row needs matching clearance up there too.
  const tabBarSpace = useTabBarSpace();
  const headerSpace = useTabsHeaderSpace(8);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { userFlat, currentUser } = useAuth();
  const navigation = useNavigation<Nav>();
  const { runAddAction } = useAddAction();
  const { showBubble, hideBubble } = useTabBarBubble();
  const [listItems, setListItems] = useState<ShoppingListItem[]>([]);
  const [addVisible, setAddVisible] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  // The checklist is split into named lists; only the active one is shown.
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [listModalVisible, setListModalVisible] = useState(false);
  // null while the modal is being used to create rather than edit.
  const [editingList, setEditingList] = useState<ShoppingList | null>(null);

  const memberById = useMemo(() => new Map((userFlat?.members ?? []).map((m) => [m.userId, m])), [userFlat]);

  // Highest upvotes first — recomputed locally (not just trusted from the
  // server's initial order) so an upvote visibly jumps a card to the top the
  // moment it's tapped, before the request round-trips.
  const sortedItems = useMemo(
    () => [...listItems].sort((a, b) => b.upvoteCount - a.upvoteCount || b.createdAt - a.createdAt),
    [listItems],
  );

  // The whole checklist grouped by category, in the same order the chips up
  // top show them — the page reads top-to-bottom the way the bar reads
  // left-to-right. Each item also carries the reveal delay it should mount
  // with, staggered continuously across the whole page rather than restarting
  // per section.
  const sections = useMemo(() => {
    const byList = new Map<string, ShoppingListItem[]>();
    for (const list of lists) byList.set(list.id, []);
    for (const item of sortedItems) {
      const key = item.listId ?? "";
      if (!byList.has(key)) byList.set(key, []);
      byList.get(key)!.push(item);
    }
    let index = 0;
    return lists.map((list) => ({
      list,
      items: (byList.get(list.id) ?? []).map((item) => ({
        item,
        delay: REVEAL_STEP * (1 + Math.min(index++, MAX_STAGGER)),
      })),
    }));
  }, [lists, sortedItems]);

  // Where each category's section currently sits in the scroll content, so
  // tapping a chip can scroll straight to it. Keyed by list id, filled in as
  // sections lay themselves out.
  const scrollRef = useRef<ScrollView>(null);
  // Drives the header fade below — it only needs to appear once something's
  // actually scrolled up underneath it, not sit there dimming the top
  // category at rest, so it's tied to the live scroll offset rather than
  // always-on.
  const scrollY = useRef(new Animated.Value(0)).current;
  const sectionYRef = useRef<Record<string, number>>({});

  // The lists come first: which one is active decides which chip reads as
  // selected. The API guarantees at least one (it creates the default
  // "Shopping" on read), so `lists[0]` is a safe landing spot.
  const loadLists = useCallback(async () => {
    if (!userFlat) return;
    const { lists: fetched } = await shoppingListService.fetchShoppingLists(userFlat.id);
    setLists(fetched);
    setActiveListId((prev) => (prev && fetched.some((l) => l.id === prev) ? prev : (fetched[0]?.id ?? null)));
  }, [userFlat]);

  // Every category's items, in one fetch — the page shows them all at once
  // now, split into named sections, rather than just the active category's.
  const loadItems = useCallback(async () => {
    if (!userFlat) return;
    const { items } = await shoppingListService.fetchShoppingListItems(userFlat.id);
    setListItems(items);
    // Opening the tab is what "reads" every item on it — the Home screen's
    // notification count stops counting them from here on.
    if (currentUser) markShoppingSeen(userFlat.id, currentUser.id, items);
  }, [userFlat, currentUser]);

  // Debounced timer behind the "tick something off, get nudged to log it"
  // bubble below — a ref rather than state since it's pure bookkeeping, not
  // anything the render needs to react to.
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadLists();
      loadItems();
      // Leaving the tab takes the nudge with it — it's about what's on this
      // screen, so it shouldn't linger over the bar once that's out of view.
      return () => {
        if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
        hideBubble();
      };
    }, [loadLists, loadItems, hideBubble]),
  );

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
    setActiveListId(listId);
    // Every category is already on screen — "selecting" one just scrolls its
    // section into view rather than swapping out what's rendered.
    // Title and chips no longer share the scroll content with the sections
    // (see the render below), so a section's own layout y is already
    // measured from the top of the scrollable area — no header height to
    // subtract any more.
    const y = sectionYRef.current[listId];
    if (y !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    }
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
    // The deleted list's own section (and its items) is going away too.
    setListItems((prev) => prev.filter((i) => i.listId !== removedId));
    if (activeListId === removedId) {
      setActiveListId(remaining[0]?.id ?? null);
    }
  };

  const reorderLists = async (orderedIds: string[]) => {
    const byId = new Map(lists.map((l) => [l.id, l]));
    const reordered = orderedIds.flatMap((id, i) => {
      const list = byId.get(id);
      return list ? [{ ...list, position: i }] : [];
    });
    // The chips have already animated into this order; the sections below
    // (heading + item stack) reorder in the same render, so ask RN to tween
    // that layout change too rather than let it snap straight to the new
    // positions.
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setLists(reordered);
    try {
      await shoppingListService.reorderShoppingLists(userFlat.id, orderedIds);
    } catch (err) {
      console.warn("Failed to save list order", err);
      loadLists();
    }
  };

  const togglePurchased = async (item: ShoppingListItem) => {
    const nextPurchased = !item.purchased;
    setListItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, purchased: nextPurchased } : i)));
    await shoppingListService.setShoppingListItemPurchased(userFlat.id, item.id, nextPurchased);

    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);

    if (!nextPurchased) {
      // Only hide it if that was the last thing still ticked off — the
      // bubble is about "you just checked something off", not a running
      // tally, so unchecking one item shouldn't kill a nudge raised by
      // another that's still ticked.
      const stillHasChecked = listItems.some((i) => i.id !== item.id && i.purchased);
      if (!stillHasChecked) hideBubble();
      return;
    }

    // Ticking something off is what raises the nudge — loading a list that
    // already has items checked from a previous session should never pop it
    // on its own. Debounced so checking off several items in a row doesn't
    // pop the bubble after the first tap and then have it fighting the rest.
    bubbleTimerRef.current = setTimeout(() => {
      showBubble("Log Expense?", () => {
        navigation.navigate("Bills");
        // The Bills tab may not have mounted yet — AddActionContext holds
        // the request until it registers its own handler, same as the
        // radial menu's "Expense" item.
        runAddAction("Bills");
      });
    }, LOG_EXPENSE_PROMPT_DELAY);
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

  // Each category's own section carries its own "Clear list" now, so this
  // takes the list to clear rather than assuming it's whichever chip is
  // active.
  const clearList = (list: ShoppingList) => {
    if (!listItems.some((i) => i.listId === list.id)) return;
    Alert.alert(
      `Clear "${list.name}"?`,
      "This removes every item from this category and lets your flatmates know it's done.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear list",
          style: "destructive",
          onPress: async () => {
            await shoppingListService.clearShoppingList(userFlat.id, list.id);
            setListItems((prev) => prev.filter((i) => i.listId !== list.id));
            setOpenItemId(null);
          },
        },
      ],
    );
  };

  // One tap for "I bought the whole run" — every unpurchased item, in every
  // category, ticked off at once, rather than working down each section by
  // hand. Reuses togglePurchased's own nudge logic so it still raises the
  // "Log Expense?" bubble, the same as ticking off any one item would.
  const purchaseEverything = async () => {
    const unpurchased = listItems.filter((i) => !i.purchased);
    if (unpurchased.length === 0) return;

    setListItems((prev) => prev.map((i) => (i.purchased ? i : { ...i, purchased: true })));
    await Promise.all(
      unpurchased.map((i) => shoppingListService.setShoppingListItemPurchased(userFlat.id, i.id, true)),
    );

    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => {
      showBubble("Log Expense?", () => {
        navigation.navigate("Bills");
        // The Bills tab may not have mounted yet — AddActionContext holds
        // the request until it registers its own handler, same as the
        // radial menu's "Expense" item.
        runAddAction("Bills");
      });
    }, LOG_EXPENSE_PROMPT_DELAY);
  };

  return (
    <View style={styles.root}>
      {/* Title and category chips are chrome, not content — pinned above the
          ScrollView rather than scrolling away with the items, so the chips
          (and the "+" to add a category) stay reachable no matter how far
          down the lists you've scrolled. */}
      <View style={[styles.fixedHeader, { paddingTop: headerSpace }]}>
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
      </View>

      {/* The scroll area itself, with a fade masking its own top edge so
          items scrolling up under the fixed header above dim out across a
          band instead of being clipped the instant they reach it. */}
      <View style={styles.scrollArea}>
        <Animated.ScrollView
          ref={scrollRef}
          style={styles.container}
          contentContainerStyle={{ paddingBottom: tabBarSpace }}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
        >
          {sections.map(({ list, items }) => (
            <View
              key={list.id}
              onLayout={(e) => {
                sectionYRef.current[list.id] = e.nativeEvent.layout.y;
              }}
              style={styles.section}
            >
              <Text style={styles.categoryHeading}>{list.name}</Text>

              {items.length === 0 && <Text style={styles.emptyText}>Nothing on this list yet.</Text>}
              {items.map(({ item, delay }) => (
                <RevealTile key={item.id} delay={delay}>
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

              {items.length > 0 && (
                <Pressable style={styles.clearButton} onPress={() => clearList(list)} hitSlop={8}>
                  <Text style={styles.clearButtonText}>Clear list</Text>
                </Pressable>
              )}
            </View>
          ))}

          {/* Below every category — the old single "Clear list" button's own
              spot, before it moved per-category — ticking off everything at
              once rather than one section at a time. */}
          {listItems.some((i) => !i.purchased) && (
            <Pressable style={styles.purchaseAllButton} onPress={purchaseEverything} hitSlop={8}>
              <Text style={styles.purchaseAllButtonText}>Purchased Everything</Text>
            </Pressable>
          )}
        </Animated.ScrollView>

        {/* Overlaps the ScrollView's own top edge rather than sitting in its
            content, so it masks whatever's scrolled underneath it without
            taking up any of the list's own space. Faded in off the live
            scroll offset — invisible at rest, so the top category reads at
            full strength until something's actually scrolling under it, then
            it's there instantly. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.headerFade,
            { opacity: scrollY.interpolate({ inputRange: [0, HEADER_FADE_HEIGHT], outputRange: [0, 1], extrapolate: "clamp" }) },
          ]}
        >
          <LinearGradient colors={[colors.bg, hexToRgba(colors.bg, 0)]} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>

      <AddShoppingItemModal visible={addVisible} onClose={() => setAddVisible(false)} onAdd={addListItem} />
      <ListCategoryModal
        visible={listModalVisible}
        list={editingList}
        canDelete={lists.length > 1}
        onClose={() => setListModalVisible(false)}
        onSubmit={submitList}
        onDelete={removeList}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    // Sits above the ScrollView in normal flow (not floating over it) — the
    // list starts right where this ends, so there's no overlap to allow for.
    fixedHeader: { paddingHorizontal: 16, backgroundColor: colors.bg },
    // Positions the fade below relative to the ScrollView's own top edge
    // rather than the screen's.
    scrollArea: { flex: 1 },
    container: { flex: 1, paddingHorizontal: 16, backgroundColor: colors.bg },
    // Sits right over the ScrollView's top edge — content dims out across
    // this band as it scrolls up underneath it, instead of being clipped the
    // instant it reaches the fixed header above.
    headerFade: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: HEADER_FADE_HEIGHT,
    },
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
    // One block per category, in the order the chips up top show them.
    section: { marginBottom: 12 },
    // Same treatment as the chip bar's own "List categories" label, so the
    // in-page section titles read as the same kind of heading.
    categoryHeading: {
      fontFamily: fonts.bold,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: colors.textMuted,
      marginBottom: 10,
    },
    // A quiet pill — one of these sits under every category now rather than
    // just the active one, so it needs to read as a small aside, not a loud
    // call to action competing with the items above it. Pulled to the right
    // so it doesn't fight the centred category heading for attention either.
    clearButton: {
      alignSelf: "flex-end",
      marginTop: 12,
      marginBottom: 4,
      borderRadius: 14,
      paddingVertical: 6,
      paddingHorizontal: 14,
      backgroundColor: colors.surfaceAlt,
    },
    clearButtonText: {
      fontFamily: fonts.bold,
      fontSize: 11,
      letterSpacing: 0.3,
      color: colors.textMuted,
    },
    // The old single "Clear list" button's own look and spot — solid, centred,
    // under everything — now doing the opposite job at the very bottom of
    // every category instead of the top of just the active one.
    purchaseAllButton: {
      alignSelf: "center",
      marginTop: 20,
      marginBottom: 8,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 20,
      backgroundColor: colors.text,
    },
    purchaseAllButtonText: {
      fontFamily: fonts.bold,
      fontSize: 13,
      letterSpacing: 0.4,
      color: colors.bg,
    },
  });
}
