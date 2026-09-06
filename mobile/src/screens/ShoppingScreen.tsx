import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  LayoutAnimation,
  Dimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTabBarSpace } from "../navigation/FlatTabBar";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useAuth } from "../context/AuthContext";
import * as shoppingListService from "../services/shoppingListService";
import ShoppingItemCard from "../components/ShoppingItemCard";
import ProfileAvatar from "../components/ProfileAvatar";
import AddShoppingItemModal from "../components/AddShoppingItemModal";
import ListCategoryBar, { type ListCategoryBarHandle } from "../components/ListCategoryBar";
import ListCategoryModal from "../components/ListCategoryModal";
import RevealTile from "../components/RevealTile";
import { useTabsHeaderSpace } from "../components/TabsHeader";
import { useRegisterAddAction, useAddAction } from "../navigation/AddActionContext";
import type { MainTabParamList } from "../navigation/MainTabNavigator";
import { useTabBarBubble } from "../navigation/TabBarBubbleContext";
import { markShoppingSeen } from "../storage/notificationSeen";
import { useTheme } from "../context/ThemeContext";
import { CARD_TONES, onColor, type ThemeColors } from "../theme/colors";
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

// Which tone an item wears — whoever added it, so the list reads at a glance
// as "who's been shopping for what". A flatmate without a chosen colour
// falls back to one hashed from their own id rather than the item's, so
// every item they've added still reads as the same person's, consistently,
// rather than a different random tone per item.
function toneFor(addedByUserId: string, addedByColor: string | null | undefined): string {
  if (addedByColor) return addedByColor;
  let hash = 0;
  for (let i = 0; i < addedByUserId.length; i++) hash = (hash * 31 + addedByUserId.charCodeAt(i)) >>> 0;
  return ITEM_TONES[hash % ITEM_TONES.length];
}

// Matches the cadence on Home, Bills and Chores: one step between blocks,
// with the per-item stagger capped so a long list's last card doesn't wait
// seconds to show up.
const REVEAL_STEP = 60;
const MAX_STAGGER = 6;

// Matches `container`'s own paddingHorizontal below — the list's rows all
// sit this far in from either edge, and so does the floating copy of one.
const LIST_SIDE_PADDING = 16;
// The floating copy of a card that follows a finger while an item is held
// and dragged — sized and positioned to match a real row exactly (full list
// width, same left edge) and only ever moves vertically: the drag is a
// straight up/down reordering-between-lists gesture, not a free-floating
// one, so nothing about it should drift sideways with the finger.
const GHOST_WIDTH = Dimensions.get("window").width - LIST_SIDE_PADDING * 2;
const GHOST_HEIGHT_FALLBACK = 64;
// While dragging, being this close to the top or bottom of the visible
// scroll area pulls the list along — otherwise a card could never be moved
// to a spot that's currently scrolled off-screen.
const AUTO_SCROLL_EDGE = 60;
const AUTO_SCROLL_STEP = 12;
const AUTO_SCROLL_MS = 16;

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
  // Non-null while the add/edit modal is renaming this item rather than
  // creating a new one — same "null means add" convention as editingList.
  const [editingItem, setEditingItem] = useState<ShoppingListItem | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  // The checklist is split into named lists; only the active one is shown.
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [listModalVisible, setListModalVisible] = useState(false);
  // null while the modal is being used to create rather than edit.
  const [editingList, setEditingList] = useState<ShoppingList | null>(null);

  // Hold-and-drag an item card to move it — within its own list (other rows
  // slide apart to open a gap; nothing is actually reordered, that's purely
  // hover feedback) or onto another category, either by dropping on a chip
  // up top or directly on that category's own section below. The dragged
  // item's own card just dims in place (see ShoppingItemCard); this screen
  // owns the floating copy that actually follows the finger, since it has to
  // render above both the scroll content and the fixed header the chips live
  // in — and it owns the auto-scroll and gap-opening that only make sense
  // with the whole list in view.
  const [draggingItem, setDraggingItem] = useState<ShoppingListItem | null>(null);
  const [dragOverListId, setDragOverListId] = useState<string | null>(null);
  const categoryBarRef = useRef<ListCategoryBarHandle>(null);
  const rootRef = useRef<View>(null);
  const rootOffsetRef = useRef({ x: 0, y: 0 });
  const ghostPos = useRef(new Animated.ValueXY()).current;
  // The dragged item's own measured height, captured when the hold starts —
  // both the ghost and the gap it opens in the list are sized to match.
  const draggedHeightRef = useRef(GHOST_HEIGHT_FALLBACK);

  // Where the scrollable area itself sits on screen (its viewport, not its
  // content) — measured once it lays out, so a raw touch point can be
  // compared against its top/bottom edge for auto-scroll, and converted into
  // "how far down the scrolled content" for hit-testing sections and rows.
  const scrollAreaRef = useRef<View>(null);
  const scrollViewportRef = useRef({ y: 0, height: 0 });
  const scrollOffsetRef = useRef(0);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // The last raw touch point seen while dragging — auto-scroll re-runs the
  // same hover math against it on every tick, since the content moves under
  // a finger that hasn't itself moved.
  const lastDragPoint = useRef({ pageX: 0, pageY: 0 });

  // Each section's own bounds within the scroll content (not just its top —
  // its height too, so a touch point can be tested against the whole band),
  // and each row's bounds *within its section*, so hovering can tell not
  // just which list a point is over but where in that list's stack.
  const sectionLayoutRef = useRef<Record<string, { y: number; height: number }>>({});
  const itemLayoutRef = useRef<Record<string, { y: number; height: number }>>({});
  // Where the dragged card started (its own slot, captured once at the
  // moment the hold turns into a drag) — the gap that opens under the
  // finger travels from here to wherever it's currently hovering, so
  // everything between the two closes up behind it and opens up ahead of
  // it, headers included, rather than just the row it's over right now.
  const dragOriginRef = useRef<{ listId: string; index: number } | null>(null);

  // One shift per item, for rows that sit between the drag's origin and its
  // current hover — same technique as the category chips' own reorder
  // shifts, just vertical. A whole section (heading, rows and its "Clear
  // list" button together) gets its own shift too, for when the gap is
  // travelling *through* it rather than opening or closing within it.
  const itemShiftsRef = useRef<Record<string, Animated.Value>>({});
  const shiftFor = useCallback((id: string) => {
    if (!itemShiftsRef.current[id]) itemShiftsRef.current[id] = new Animated.Value(0);
    return itemShiftsRef.current[id];
  }, []);
  const sectionShiftsRef = useRef<Record<string, Animated.Value>>({});
  const sectionShiftFor = useCallback((id: string) => {
    if (!sectionShiftsRef.current[id]) sectionShiftsRef.current[id] = new Animated.Value(0);
    return sectionShiftsRef.current[id];
  }, []);

  const memberById = useMemo(() => new Map((userFlat?.members ?? []).map((m) => [m.userId, m])), [userFlat]);
  const toneForItem = (item: ShoppingListItem) => toneFor(item.addedByUserId, memberById.get(item.addedByUserId)?.color);

  // Highest upvotes first — recomputed locally (not just trusted from the
  // server's initial order) so an upvote visibly jumps a card to the top the
  // moment it's tapped, before the request round-trips. `position` (drag-
  // chosen, see reorderShoppingListItems) only breaks ties within a vote
  // count, so a manual reorder can shuffle equally-voted items around each
  // other but never outrank a more-upvoted one.
  const sortedItems = useMemo(
    () =>
      [...listItems].sort(
        (a, b) => b.upvoteCount - a.upvoteCount || a.position - b.position || b.createdAt - a.createdAt,
      ),
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

  useRegisterAddAction("Shopping", () => {
    setEditingItem(null);
    setAddVisible(true);
  });

  if (!userFlat) return null;

  const addListItem = async (name: string) => {
    if (!activeListId) return;
    // A "duplicate" name resolves to the existing item (now with one more
    // vote) instead of a new row — merge it in place rather than prepending.
    const { item } = await shoppingListService.addShoppingListItem(userFlat.id, { name, listId: activeListId });
    setListItems((prev) => (prev.some((i) => i.id === item.id) ? prev.map((i) => (i.id === item.id ? item : i)) : [item, ...prev]));
  };

  const openEditItemModal = (item: ShoppingListItem) => {
    setOpenItemId((prev) => (prev === item.id ? null : prev));
    setEditingItem(item);
    setAddVisible(true);
  };

  // Serves the same modal as adding — when editingItem is set, submitting
  // renames that item instead of creating a new one.
  const submitItemModal = async (name: string) => {
    if (editingItem) {
      const { item } = await shoppingListService.renameShoppingListItem(userFlat.id, editingItem.id, name);
      setListItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      return;
    }
    await addListItem(name);
  };

  const closeItemModal = () => {
    setAddVisible(false);
    setEditingItem(null);
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

  // Converts a raw touch point's height into where the floating copy should
  // sit inside the root view — vertically centred on the finger, but always
  // at the list's own fixed left edge. The drag itself is vertical-only, so
  // the copy never drifts sideways even though the underlying touch (used
  // for hit-testing chips/sections) can.
  const positionGhost = (pageY: number) => {
    ghostPos.setValue({
      x: LIST_SIDE_PADDING,
      y: pageY - rootOffsetRef.current.y - draggedHeightRef.current / 2,
    });
  };

  // A touch point (screen coordinates) → how far down the scrolled content
  // that lands, in the same space `sectionLayoutRef`/`itemLayoutRef` are
  // measured in.
  const contentYFor = (pageY: number) =>
    pageY - scrollViewportRef.current.y + scrollOffsetRef.current;

  // Which list (if any) a touch point is over, and where in that list's
  // stack — checked against the category chips first (the explicit, always-
  // reachable target), then against the sections in the scroll content
  // themselves, so dropping directly on another category's own cards works
  // just as well as dropping on its chip.
  const resolveHover = (
    excludeItemId: string,
    pageX: number,
    pageY: number,
  ): { listId: string; index: number } | null => {
    const chipHit = categoryBarRef.current?.hitTest(pageX, pageY);
    if (chipHit) {
      const items = sections.find((s) => s.list.id === chipHit)?.items ?? [];
      return { listId: chipHit, index: items.length };
    }

    const contentY = contentYFor(pageY);
    for (const [listId, bounds] of Object.entries(sectionLayoutRef.current)) {
      if (contentY < bounds.y || contentY > bounds.y + bounds.height) continue;
      const localY = contentY - bounds.y;
      const items = (sections.find((s) => s.list.id === listId)?.items ?? []).filter(
        (row) => row.item.id !== excludeItemId,
      );
      let index = items.length;
      for (let i = 0; i < items.length; i++) {
        const layout = itemLayoutRef.current[items[i].item.id];
        if (layout && localY < layout.y + layout.height / 2) {
          index = i;
          break;
        }
      }
      return { listId, index };
    }
    return null;
  };

  // The gap under a held card runs from where it was picked up to wherever
  // it's hovering now — everything in between shifts by exactly one card's
  // worth of space to close up behind it and open up ahead of it. A whole
  // section (its heading included) shifts as a rigid block when the gap is
  // passing straight through it; the two end sections (origin and target,
  // which may be the same one) instead shift only the individual rows the
  // gap has actually crossed within them, since their own headings don't
  // move — nothing here is persisted, it's purely a "here's where it'd
  // land" preview.
  const applyShifts = (draggedItemId: string, hover: { listId: string; index: number } | null) => {
    const shiftAmount = draggedHeightRef.current;
    const origin = dragOriginRef.current;

    // Every section's own starting position on one shared number line, in
    // units of "other rows before it" (the dragged row itself doesn't get a
    // slot on this line at all).
    const sectionStart: Record<string, number> = {};
    let cursor = 0;
    for (const { list, items } of sections) {
      sectionStart[list.id] = cursor;
      cursor += items.filter((row) => row.item.id !== draggedItemId).length;
    }
    const flatIndexOf = (pos: { listId: string; index: number } | null) =>
      pos ? sectionStart[pos.listId] + pos.index : null;

    const originFlat = flatIndexOf(origin);
    const targetFlat = flatIndexOf(hover);
    // dir === -1: the range [lo, hi) slides up one slot (the gap moved past
    // it, forward). dir === 1: the range [lo, hi) slides down one slot (the
    // gap moved past it, backward). dir === 0: nothing moves.
    let lo = 0;
    let hi = -1;
    let dir = 0;
    if (originFlat !== null && targetFlat !== null && originFlat !== targetFlat) {
      if (targetFlat > originFlat) {
        lo = originFlat;
        hi = targetFlat;
        dir = -1;
      } else {
        lo = targetFlat;
        hi = originFlat;
        dir = 1;
      }
    }

    const sectionOrder = sections.map((s) => s.list.id);
    const originListIndex = origin ? sectionOrder.indexOf(origin.listId) : -1;
    const targetListIndex = hover ? sectionOrder.indexOf(hover.listId) : -1;
    const spanLow = Math.min(originListIndex, targetListIndex);
    const spanHigh = Math.max(originListIndex, targetListIndex);

    const animate = (value: Animated.Value, toValue: number) =>
      Animated.spring(value, { toValue, useNativeDriver: true, friction: 14, tension: 140 }).start();

    let idx = 0;
    for (const { list, items } of sections) {
      const isEndpointSection = list.id === origin?.listId || list.id === hover?.listId;
      // A section the gap is passing straight through, rather than opening
      // or closing within — its own rows are left alone below and it moves
      // as one piece instead.
      const listIndex = sectionOrder.indexOf(list.id);
      const isIntermediate = dir !== 0 && !isEndpointSection && listIndex > spanLow && listIndex < spanHigh;
      animate(sectionShiftFor(list.id), isIntermediate ? dir * shiftAmount : 0);

      items.forEach(({ item }) => {
        if (item.id === draggedItemId) return;
        const inRange = dir !== 0 && !isIntermediate && idx >= lo && idx < hi;
        animate(shiftFor(item.id), inRange ? dir * shiftAmount : 0);
        idx++;
      });
    }
  };

  // Springs every shift back to 0 rather than snapping it — dropped at the
  // same moment the data reorders (which brings its own LayoutAnimation),
  // so the row settling into its new natural position and this shift
  // easing back off it move together instead of the shift instantly
  // vanishing a frame before the reorder actually renders.
  const clearShifts = () => {
    const spring = (v: Animated.Value) =>
      Animated.spring(v, { toValue: 0, useNativeDriver: true, friction: 14, tension: 140 }).start();
    Object.values(itemShiftsRef.current).forEach(spring);
    Object.values(sectionShiftsRef.current).forEach(spring);
  };

  const stopAutoScroll = () => {
    if (autoScrollTimer.current) {
      clearInterval(autoScrollTimer.current);
      autoScrollTimer.current = null;
    }
  };

  // Re-runs the same hover math the last real touch move did — called both
  // from a move event and, while auto-scrolling, from the timer ticking the
  // content along under a finger that hasn't itself moved.
  const lastHoverKeyRef = useRef<string | null>(null);
  const updateHover = (item: ShoppingListItem, pageX: number, pageY: number) => {
    const hover = resolveHover(item.id, pageX, pageY);
    const key = hover ? `${hover.listId}:${hover.index}` : null;
    setDragOverListId(hover?.listId ?? null);
    // The gap only needs to move (and its springs only need restarting)
    // when the target slot actually changes, not on every raw touch move.
    if (key === lastHoverKeyRef.current) return;
    lastHoverKeyRef.current = key;
    applyShifts(item.id, hover);
  };

  const maybeAutoScroll = (item: ShoppingListItem, pageY: number) => {
    const viewport = scrollViewportRef.current;
    // The tab bar floats over the page rather than taking up its own layout
    // space, so this view's own measured bottom edge runs behind it, well
    // past where the list actually reads as "the bottom" on screen. The
    // trigger zone has to back off by the same amount the list already
    // pads its content by, or holding an item down near the bar (still
    // above it) never counts as "near the edge" at all.
    const visibleBottom = viewport.y + viewport.height - tabBarSpace;
    let dir = 0;
    if (pageY - viewport.y < AUTO_SCROLL_EDGE) dir = -1;
    else if (visibleBottom - pageY < AUTO_SCROLL_EDGE) dir = 1;

    if (dir === 0) {
      stopAutoScroll();
      return;
    }
    if (autoScrollTimer.current) return;
    autoScrollTimer.current = setInterval(() => {
      const next = Math.max(0, scrollOffsetRef.current + dir * AUTO_SCROLL_STEP);
      if (next === scrollOffsetRef.current) return;
      scrollOffsetRef.current = next;
      scrollRef.current?.scrollTo({ y: next, animated: false });
      updateHover(item, lastDragPoint.current.pageX, lastDragPoint.current.pageY);
    }, AUTO_SCROLL_MS);
  };

  const handleItemDragStart = (item: ShoppingListItem, pageX: number, pageY: number) => {
    draggedHeightRef.current = itemLayoutRef.current[item.id]?.height ?? GHOST_HEIGHT_FALLBACK;
    // Where the gap starts travelling from — the item's own slot, read the
    // same way a hover target is, off the touch point that's picking it up.
    dragOriginRef.current = resolveHover(item.id, pageX, pageY);
    setDraggingItem(item);
    positionGhost(pageY);
    lastDragPoint.current = { pageX, pageY };
    updateHover(item, pageX, pageY);
  };

  const handleItemDragMove = (item: ShoppingListItem, pageX: number, pageY: number) => {
    positionGhost(pageY);
    lastDragPoint.current = { pageX, pageY };
    updateHover(item, pageX, pageY);
    maybeAutoScroll(item, pageY);
  };

  const handleItemDragEnd = async (item: ShoppingListItem, pageX: number, pageY: number) => {
    stopAutoScroll();
    const hover = resolveHover(item.id, pageX, pageY);
    const origin = dragOriginRef.current;
    setDraggingItem(null);
    setDragOverListId(null);
    clearShifts();
    lastHoverKeyRef.current = null;
    dragOriginRef.current = null;
    // No valid drop, or picked up and set back down without actually
    // crossing into a new slot — nothing to persist.
    if (!hover || (origin && origin.listId === hover.listId && origin.index === hover.index)) return;

    // The target list's own displayed order (already vote-sorted, dragged
    // item excluded — same array `resolveHover` used) with the dragged item
    // reinserted at wherever it was dropped. Position is then just each
    // item's index in this array: it only has to break ties within a vote
    // count, so replacing the whole list's positions with the order it's
    // already sitting in (plus the one move) can't disturb anything above
    // or below a vote-count boundary.
    const orderedIds = (sections.find((s) => s.list.id === hover.listId)?.items ?? [])
      .map((row) => row.item.id)
      .filter((id) => id !== item.id);
    orderedIds.splice(hover.index, 0, item.id);
    const positionById = new Map(orderedIds.map((id, index) => [id, index]));

    // No LayoutAnimation here — the shift springs (still easing back to 0,
    // see clearShifts above) are already carrying every displaced row
    // smoothly into this exact arrangement. Animating the layout diff too
    // would re-animate the whole list a second time on top of that.
    setListItems((prev) =>
      prev.map((i) => {
        const position = positionById.get(i.id);
        if (position === undefined) return i;
        return i.id === item.id ? { ...i, listId: hover.listId, position } : { ...i, position };
      }),
    );
    try {
      await shoppingListService.reorderShoppingListItems(userFlat.id, hover.listId, orderedIds);
    } catch (err) {
      console.warn("Failed to reorder shopping list items", err);
      loadItems();
    }
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
    <View
      ref={rootRef}
      style={styles.root}
      onLayout={() => {
        // The ghost is positioned in this view's own local coordinates, so
        // page-space touch points need this offset to land there.
        rootRef.current?.measureInWindow((x, y) => {
          rootOffsetRef.current = { x, y };
        });
      }}
    >
      {/* Title and category chips are chrome, not content — pinned above the
          ScrollView rather than scrolling away with the items, so the chips
          (and the "+" to add a category) stay reachable no matter how far
          down the lists you've scrolled. */}
      <View style={[styles.fixedHeader, { paddingTop: headerSpace }]}>
        <Text style={styles.pageTitle}>Shopping List</Text>

        <RevealTile delay={0}>
          <ListCategoryBar
            ref={categoryBarRef}
            lists={lists}
            activeListId={activeListId}
            onSelect={selectList}
            onAdd={openNewListModal}
            onEdit={openEditListModal}
            onReorder={reorderLists}
            dropHighlightId={dragOverListId}
          />
        </RevealTile>
      </View>

      {/* The scroll area itself, with a fade masking its own top edge so
          items scrolling up under the fixed header above dim out across a
          band instead of being clipped the instant they reach it. */}
      <View
        ref={scrollAreaRef}
        style={styles.scrollArea}
        onLayout={() => {
          // The viewport's own screen position — used both to test how close
          // a drag is to its top/bottom edge (auto-scroll) and to convert a
          // touch point into scroll-content coordinates (section/row hover).
          scrollAreaRef.current?.measureInWindow((_x, y, _width, height) => {
            scrollViewportRef.current = { y, height };
          });
        }}
      >
        <Animated.ScrollView
          ref={scrollRef}
          style={styles.container}
          contentContainerStyle={{ paddingBottom: tabBarSpace }}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            scrollY.setValue(e.nativeEvent.contentOffset.y);
            scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          // A held item owns the gesture (see ShoppingItemCard) so a normal
          // swipe never reaches the ScrollView anyway, but this also blocks
          // any momentum scroll already in flight from an *earlier* swipe —
          // otherwise the list can keep drifting under a card you're
          // actively holding. Only the auto-scroll near the top/bottom edge
          // (a direct `scrollTo`, unaffected by this) should move it now.
          scrollEnabled={!draggingItem}
        >
          {sections.map(({ list, items }) => (
            <Animated.View
              key={list.id}
              // Measured on this outer wrapper, not the section View inside
              // it, so layout.y lands relative to the scroll content (what
              // the hover math needs) rather than to this view's own
              // transform, which doesn't affect layout at all.
              onLayout={(e) => {
                sectionYRef.current[list.id] = e.nativeEvent.layout.y;
                sectionLayoutRef.current[list.id] = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height };
              }}
              style={{ transform: [{ translateY: sectionShiftFor(list.id) }] }}
            >
              <View style={styles.section}>
                <Text style={styles.categoryHeading}>{list.name}</Text>

                {items.length === 0 && <Text style={styles.emptyText}>Nothing on this list yet.</Text>}
                {items.map(({ item, delay }) => (
                  <Animated.View
                    key={item.id}
                    // Measured here, on the item's own direct child of the
                    // section — its layout.y lands relative to the section
                    // itself (what the hover math needs), not to this
                    // view's own transform, which doesn't affect layout.
                    onLayout={(e) => {
                      itemLayoutRef.current[item.id] = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height };
                    }}
                    style={{ transform: [{ translateY: shiftFor(item.id) }] }}
                  >
                    <RevealTile delay={delay}>
                      <ShoppingItemCard
                        item={item}
                        tone={toneForItem(item)}
                        addedBy={memberById.get(item.addedByUserId)}
                        upvoters={item.upvotedByUserIds.map((id) => memberById.get(id)).filter((m): m is FlatMember => !!m)}
                        upvoted={!!currentUser && item.upvotedByUserIds.includes(currentUser.id)}
                        open={openItemId === item.id}
                        dragging={draggingItem?.id === item.id}
                        onToggle={() => togglePurchased(item)}
                        onDelete={() => deleteListItem(item.id)}
                        onEdit={() => openEditItemModal(item)}
                        onUpvote={() => toggleUpvote(item)}
                        onSwipeOpen={() => setOpenItemId(item.id)}
                        onSwipeClose={() => setOpenItemId((prev) => (prev === item.id ? null : prev))}
                        onDragStart={(pageX, pageY) => handleItemDragStart(item, pageX, pageY)}
                        onDragMove={(pageX, pageY) => handleItemDragMove(item, pageX, pageY)}
                        onDragEnd={(pageX, pageY) => handleItemDragEnd(item, pageX, pageY)}
                      />
                    </RevealTile>
                  </Animated.View>
                ))}

                {items.length > 0 && (
                  <Pressable style={styles.clearButton} onPress={() => clearList(list)} hitSlop={8}>
                    <Text style={styles.clearButtonText}>Clear list</Text>
                  </Pressable>
                )}
              </View>
            </Animated.View>
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

      {/* The floating copy a held item drags around as — a stand-in for the
          real card (same tone, avatar and name) rendered here, outside the
          ScrollView, so it can travel up over the fixed header (where the
          category chips live) without being clipped by the scroll
          viewport's own edge. */}
      {draggingItem && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dragGhost,
            {
              backgroundColor: toneForItem(draggingItem),
              height: draggedHeightRef.current,
              // No rotate: a full-width row tilting would jut out past the
              // screen edges. Straight up/down only, matching the drag
              // itself — just a touch of scale to read as "picked up".
              transform: [...ghostPos.getTranslateTransform(), { scale: 1.02 }],
            },
          ]}
        >
          <ProfileAvatar
            displayName={memberById.get(draggingItem.addedByUserId)?.displayName ?? "?"}
            color={memberById.get(draggingItem.addedByUserId)?.color ?? null}
            photo={memberById.get(draggingItem.addedByUserId)?.photo}
            size={40}
            fallbackOn={onColor(toneForItem(draggingItem))}
          />
          <Text
            style={[styles.dragGhostText, { color: onColor(toneForItem(draggingItem)) }]}
            numberOfLines={2}
          >
            {draggingItem.name}
          </Text>
        </Animated.View>
      )}

      <AddShoppingItemModal visible={addVisible} item={editingItem} onClose={closeItemModal} onSubmit={submitItemModal} />
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
    // Follows the finger while an item is held-and-dragged — a stand-in for
    // the real card (same row layout, same rounding) positioned in the root
    // view's own local coordinates, above everything else on the page,
    // including the fixed header.
    dragGhost: {
      position: "absolute",
      top: 0,
      left: 0,
      width: GHOST_WIDTH,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 16,
      padding: 12,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 10,
      zIndex: 100,
    },
    dragGhostText: {
      flex: 1,
      fontFamily: fonts.bold,
      fontSize: typeScale.body,
    },
  });
}
