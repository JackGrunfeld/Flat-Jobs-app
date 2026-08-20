import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBarSpace } from "../navigation/FlatTabBar";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import * as shoppingService from "../services/shoppingService";
import * as settlementsService from "../services/settlementsService";
import SettleUpModal from "../components/SettleUpModal";
import AddExpenseModal, { type NewExpense } from "../components/AddExpenseModal";
import SettingsButton, { HEADER_TITLE_TOP } from "../components/SettingsButton";
import RevealTile from "../components/RevealTile";
import { useRegisterAddAction } from "../navigation/AddActionContext";
import { useTheme } from "../context/ThemeContext";
import { CARD_TONES, onColor, withAlpha } from "../theme/colors";
import type { ThemeColors } from "../theme/colors";
import { inkFor } from "../theme/cardInk";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import { buildDisplayNames } from "../utils/displayNames";
import type { ShoppingItem, Balance, Settlement } from "../types";
import ProfileAvatar from "../components/ProfileAvatar";

const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;
// Signed, for the per-flatmate cards: the direction is already said in words
// beside it, so the number itself never carries a minus.
const formatAbs = (cents: number) => formatMoney(Math.abs(cents));

// Matches the chores roster card, so a flatmate's block is the same object on
// both tabs — one header tall collapsed, expanding in place when tapped.
const CARD_HEADER_HEIGHT = 72;
// Avatar disc on the per-flatmate balance cards, sized to sit cleanly beside
// the 26pt name in the same 72pt header.
const CARD_AVATAR = 34;
// Face pile on the summary card, and how far each disc slides under the one
// before it.
const FACE = 28;
const FACE_OVERLAP = 9;

type Styles = ReturnType<typeof createStyles>;

// One row per flatmate you have money between, netted to a single number:
// several expenses each way is still one question ("do I owe Sam, or does Sam
// owe me?"), and one card is the shape of that answer.
type Position = {
  userId: string;
  displayName: string;
  color: string | null;
  photo: string | null;
  /** Positive: they owe you. Negative: you owe them. */
  netCents: number;
  /** The expenses the two of you actually share, newest first. */
  shared: ShoppingItem[];
};

// Colour+initials disc. Falls back to the card's own foreground when a
// flatmate hasn't picked a colour yet, so it's never an invisible circle.
// Thin wrapper over the app-wide ProfileAvatar so this screen's call sites keep
// passing `fg` — the avatars here sit on block-coloured tiles, so a member
// without a colour of their own has to fall back to the tile's ink rather than
// the page's.
function Avatar({
  member,
  size,
  fg,
}: {
  member: { displayName: string; color: string | null; photo?: string | null };
  size: number;
  fg: string;
}) {
  return (
    <ProfileAvatar
      displayName={member.displayName}
      color={member.color}
      photo={member.photo ?? null}
      size={size}
      fallbackOn={fg}
    />
  );
}

// The shared expense ledger, built to the same rules as the dashboard and the
// chores tab: a block-coloured summary tile at the top carrying the one number
// that matters, then one card per flatmate in that flatmate's own colour —
// tapped to drop down the expenses behind it — and the full ledger and
// settlement history collapsed underneath, the way the chore list is.
export default function BillsScreen() {
  const insets = useSafeAreaInsets();
  // The tab bar floats over the page, so the last row needs
  // somewhere to scroll clear to.
  const tabBarSpace = useTabBarSpace();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentUser, userFlat } = useAuth();

  const [expenses, setExpenses] = useState<ShoppingItem[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [settleTarget, setSettleTarget] = useState<Balance | null>(null);
  // Whose reminder is in flight, so the button can say so and no one can send
  // three by tapping three times.
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [addVisible, setAddVisible] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  // Collapsed by default: who owes what is what the tab is for, and the full
  // ledger is long enough to bury it.
  const [showLedger, setShowLedger] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    if (!userFlat) return;
    const [expensesRes, balancesRes, settlementsRes] = await Promise.all([
      shoppingService.fetchShoppingItems(userFlat.id),
      settlementsService.fetchBalances(userFlat.id),
      settlementsService.fetchSettlements(userFlat.id),
    ]);
    setExpenses(expensesRes.items);
    setBalances(balancesRes.balances);
    setSettlements(settlementsRes.settlements);
  }, [userFlat]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useRegisterAddAction("Bills", () => setAddVisible(true));

  const nameFor = useCallback(
    (userId: string) => userFlat?.members.find((m) => m.userId === userId)?.displayName ?? "Unknown",
    [userFlat],
  );

  // Every balance that involves me, netted per counterpart and signed from my
  // point of view — so two rows pointing opposite ways collapse into the one
  // number a card can lead with.
  const positions = useMemo<Position[]>(() => {
    if (!userFlat || !currentUser) return [];
    const displayNames = buildDisplayNames(userFlat.members);
    const net = new Map<string, number>();

    for (const b of balances) {
      if (b.userId === currentUser.id) net.set(b.owesUserId, (net.get(b.owesUserId) ?? 0) - b.amountCents);
      else if (b.owesUserId === currentUser.id) net.set(b.userId, (net.get(b.userId) ?? 0) + b.amountCents);
    }

    return Array.from(net.entries())
      // A pair that nets to nothing is settled, and a settled pair is exactly
      // what this list is meant not to show.
      .filter(([, cents]) => cents !== 0)
      .map(([userId, netCents]) => {
        const member = userFlat.members.find((m) => m.userId === userId);
        return {
          userId,
          displayName: displayNames[userId] ?? member?.displayName ?? "Unknown",
          color: member?.color ?? null,
          photo: member?.photo ?? null,
          netCents,
          // An expense is "between us" when one of us paid and the other is on
          // the split — that's the set the number above was built from.
          shared: expenses
            .filter((e) => {
              const between = [e.addedByUserId, ...e.splitWith];
              return between.includes(currentUser.id) && between.includes(userId);
            })
            .sort((a, b) => b.createdAt - a.createdAt),
        };
      })
      .sort((a, b) => Math.abs(b.netCents) - Math.abs(a.netCents));
  }, [balances, expenses, userFlat, currentUser]);

  // The two halves of the headline. Kept apart rather than summed to a single
  // net: "you owe $40 and are owed $35" is a different situation from "you owe
  // $5", and the tile shouldn't flatten the two together.
  const summary = useMemo(() => {
    const owe = positions.filter((p) => p.netCents < 0).reduce((sum, p) => sum - p.netCents, 0);
    const owed = positions.filter((p) => p.netCents > 0).reduce((sum, p) => sum + p.netCents, 0);
    return { owe, owed };
  }, [positions]);

  // Distinct flatmates who've paid for something, as a face pile. Caps at four:
  // past that the discs stop being individually readable and the overflow
  // count says it better.
  const payerFaces = useMemo(() => {
    if (!userFlat) return { faces: [], extra: 0 };
    const ids = Array.from(new Set(expenses.map((e) => e.addedByUserId)));
    const members = ids
      .map((id) => userFlat.members.find((m) => m.userId === id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    return { faces: members.slice(0, 4), extra: Math.max(0, members.length - 4) };
  }, [expenses, userFlat]);

  // The ledger, newest first and grouped by category — the same shape the
  // chores tab's "All chores" section takes, so the collapsed list behaves the
  // way it does over there.
  const expensesByCategory = useMemo(() => {
    const groups = new Map<string, ShoppingItem[]>();
    for (const item of [...expenses].sort((a, b) => b.createdAt - a.createdAt)) {
      const list = groups.get(item.category);
      if (list) list.push(item);
      else groups.set(item.category, [item]);
    }
    return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
  }, [expenses]);

  const totalTracked = useMemo(() => expenses.reduce((sum, e) => sum + e.costCents, 0), [expenses]);

  if (!userFlat || !currentUser) return null;

  const addExpense = async (expense: NewExpense) => {
    await shoppingService.addShoppingItem(userFlat.id, expense);
    await load();
  };

  const deleteExpense = async (itemId: string) => {
    await shoppingService.deleteShoppingItem(userFlat.id, itemId);
    await load();
  };

  const submitSettlement = async (amountCents: number, note: string) => {
    if (!settleTarget) return;
    await settlementsService.settleUp(userFlat.id, { toUserId: settleTarget.owesUserId, amountCents, note });
    setSettleTarget(null);
    await load();
  };

  // Nudging someone is a message sent on your behalf, so it says what it did.
  // The call used to be fired without a catch or any feedback: a failure came
  // out as an unhandled rejection and the button looked identical whether the
  // push landed, bounced, or never left.
  const remindDebtor = async (position: Position) => {
    if (remindingId) return;
    setRemindingId(position.userId);
    try {
      const { delivered } = await settlementsService.remindDebtor(userFlat.id, {
        toUserId: position.userId,
        amountCents: position.netCents,
      });
      if (delivered > 0) {
        Alert.alert("Reminder sent", `${position.displayName} has been nudged about ${formatAbs(position.netCents)}.`);
      } else {
        Alert.alert(
          "Couldn't reach them",
          `${position.displayName} doesn't have notifications turned on, so nothing was delivered.`,
        );
      }
    } catch (err) {
      console.warn("Failed to send reminder", err);
      Alert.alert("Couldn't send reminder", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setRemindingId(null);
    }
  };

  // The headline value and its caption. Whichever direction is the larger sum
  // leads — that's the one you'd act on.
  const heroFg = onColor(CARD_TONES.indigo);
  const owingOut = summary.owe >= summary.owed;
  const heroValue =
    summary.owe === 0 && summary.owed === 0
      ? "All settled up"
      : owingOut
        ? `You owe ${formatMoney(summary.owe)}`
        : `You're owed ${formatMoney(summary.owed)}`;
  const heroCaption =
    summary.owe === 0 && summary.owed === 0
      ? "Squeaky clean — nothing outstanding"
      : owingOut
        ? summary.owed > 0
          ? `Time to settle up · ${formatMoney(summary.owed)} coming back to you`
          : "Time to settle up"
        : summary.owe > 0
          ? `Cha-ching — come collect · ${formatMoney(summary.owe)} still to pay out`
          : "Cha-ching — come collect";

  return (
    <View style={styles.root}>
      <ScrollView
        style={[styles.container, { paddingTop: insets.top + HEADER_TITLE_TOP }]}
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
      >
        <Text style={styles.pageTitle}>Bills</Text>

        {/* The one number that matters, on the same indigo the dashboard's
            balance tile wears — so arriving from that tile lands on the same
            colour it was tapped on. */}
        <RevealTile delay={0}>
          <View style={[styles.heroCard, { backgroundColor: CARD_TONES.indigo }]}>
            <View style={styles.heroTopRow}>
              <View style={styles.facePile}>
                {payerFaces.faces.map((member, i) => (
                  <View
                    key={member.userId}
                    style={{ marginLeft: i === 0 ? 0 : -FACE_OVERLAP, zIndex: payerFaces.faces.length - i }}
                  >
                    <Avatar member={member} size={FACE} fg={heroFg} />
                  </View>
                ))}
                {payerFaces.extra > 0 && (
                  <View style={[styles.faceMore, { marginLeft: -FACE_OVERLAP, backgroundColor: withAlpha(heroFg, 0.2) }]}>
                    <Text style={[styles.faceMoreText, { color: heroFg }]}>+{payerFaces.extra}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* adjustsFontSizeToFit is the belt to the braces: a four-figure
                balance shrinks to the line rather than truncating. */}
            <Text
              style={[styles.heroValue, { color: heroFg }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {heroValue}
            </Text>
            <Text style={[styles.heroCaption, { color: withAlpha(heroFg, 0.72) }]} numberOfLines={2}>
              {heroCaption}
            </Text>
          </View>
        </RevealTile>

        <Text style={styles.stats}>
          {expenses.length} expense{expenses.length === 1 ? "" : "s"} · {formatMoney(totalTracked)} tracked
        </Text>

        {positions.length === 0 && <Text style={styles.empty}>All settled up.</Text>}

        {positions.map((position, index) => {
          const expanded = expandedUserId === position.userId;
          const background = position.color ?? colors.accent;
          const ink = inkFor(background);
          const iOwe = position.netCents < 0;
          const hasDetail = position.shared.length > 0;

          return (
            <RevealTile key={position.userId} delay={60 + index * 60}>
              <Pressable
                style={({ pressed }) => [
                  styles.balanceCard,
                  { backgroundColor: background },
                  pressed && hasDetail && styles.balanceCardPressed,
                ]}
                onPress={() => hasDetail && setExpandedUserId(expanded ? null : position.userId)}
                disabled={!hasDetail}
              >
                <View style={styles.cardHeaderRow}>
                  <Avatar
                    member={{ displayName: position.displayName, color: position.color, photo: position.photo }}
                    size={CARD_AVATAR}
                    fg={ink.strong}
                  />
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardName, { color: ink.strong }]} numberOfLines={1}>
                      {position.displayName}
                    </Text>
                    <Text style={[styles.cardSubtitle, { color: ink.body }]} numberOfLines={1}>
                      {iOwe
                        ? `You owe ${formatAbs(position.netCents)}`
                        : `Owes you ${formatAbs(position.netCents)}`}
                    </Text>
                  </View>

                  <View style={styles.cardAmountBlock}>
                    {iOwe ? (
                      <Pressable
                        hitSlop={8}
                        onPress={() =>
                          setSettleTarget({
                            userId: currentUser.id,
                            owesUserId: position.userId,
                            amountCents: -position.netCents,
                          })
                        }
                        style={[styles.settleButton, { backgroundColor: ink.strong }]}
                      >
                        <Text style={[styles.settleButtonText, { color: ink.onStrong }]}>Settle up</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        hitSlop={8}
                        onPress={() => remindDebtor(position)}
                        // One nudge at a time: the button sends on every tap,
                        // and each one is a real notification on someone
                        // else's phone.
                        disabled={remindingId !== null}
                        style={[
                          styles.settleButton,
                          { backgroundColor: ink.strong },
                          remindingId !== null && styles.settleButtonBusy,
                        ]}
                      >
                        <Text style={[styles.settleButtonText, { color: ink.onStrong }]}>
                          {remindingId === position.userId ? "Sending…" : "Remind"}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {expanded && (
                  <View style={[styles.details, { borderTopColor: ink.hairline }]}>
                    {position.shared.map((item, i) => (
                      <View
                        key={item.id}
                        style={[
                          styles.detailRow,
                          { borderBottomColor: ink.hairline },
                          i === position.shared.length - 1 && styles.detailRowLast,
                        ]}
                      >
                        <View style={styles.flex1}>
                          <Text style={[styles.detailName, { color: ink.body }]}>{item.name}</Text>
                          <Text style={[styles.detailMeta, { color: ink.muted }]}>
                            {nameFor(item.addedByUserId)} paid · split {item.splitWith.length} way
                            {item.splitWith.length === 1 ? "" : "s"}
                          </Text>
                        </View>
                        <Text style={[styles.detailAmount, { color: ink.strong }]}>
                          {formatMoney(item.costCents)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </Pressable>
            </RevealTile>
          );
        })}

        {expenses.length === 0 && <Text style={styles.empty}>No expenses logged yet — tap + to add one.</Text>}

        {expensesByCategory.length > 0 && (
          <>
            <Pressable style={styles.manageTitleRow} onPress={() => setShowLedger((open) => !open)} hitSlop={6}>
              <Text style={styles.manageTitle}>All expenses</Text>
              <Text style={styles.manageCount}>{expenses.length}</Text>
              <Ionicons name={showLedger ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
            </Pressable>
            {showLedger &&
              expensesByCategory.map(({ category, items }) => (
                <View key={category}>
                  <Text style={styles.groupLabel}>{category}</Text>
                  {items.map((item) => (
                    <View key={item.id} style={styles.manageCard}>
                      <View style={styles.manageCardHeader}>
                        <View style={styles.flex1}>
                          <Text style={styles.manageItemName}>{item.name}</Text>
                          <Text style={styles.manageItemMeta}>
                            {nameFor(item.addedByUserId)} paid {formatMoney(item.costCents)}, split{" "}
                            {item.splitWith.length} way{item.splitWith.length === 1 ? "" : "s"}
                          </Text>
                        </View>
                        <Pressable style={styles.iconButton} onPress={() => deleteExpense(item.id)} hitSlop={8}>
                          <Ionicons name="trash-outline" size={14} color={colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              ))}
          </>
        )}

        {settlements.length > 0 && (
          <>
            <Pressable style={styles.manageTitleRow} onPress={() => setShowHistory((open) => !open)} hitSlop={6}>
              <Text style={styles.manageTitle}>Settled</Text>
              <Text style={styles.manageCount}>{settlements.length}</Text>
              <Ionicons name={showHistory ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
            </Pressable>
            {showHistory &&
              settlements.map((s) => (
                <View key={s.id} style={styles.manageCard}>
                  <View style={styles.manageCardHeader}>
                    <View style={styles.flex1}>
                      <Text style={styles.manageItemName}>
                        {nameFor(s.fromUserId)} → {nameFor(s.toUserId)}
                      </Text>
                      {!!s.note && <Text style={styles.manageItemMeta}>{s.note}</Text>}
                    </View>
                    <Text style={styles.settledAmount}>{formatMoney(s.amountCents)}</Text>
                  </View>
                </View>
              ))}
          </>
        )}

        <AddExpenseModal
          visible={addVisible}
          members={userFlat.members}
          currentUserId={currentUser.id}
          onClose={() => setAddVisible(false)}
          onSubmit={addExpense}
        />

        <SettleUpModal
          visible={!!settleTarget}
          counterpartName={settleTarget ? nameFor(settleTarget.owesUserId) : ""}
          suggestedAmountCents={settleTarget?.amountCents ?? 0}
          onClose={() => setSettleTarget(null)}
          onSubmit={submitSettlement}
        />
      </ScrollView>
      <SettingsButton />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    container: { flex: 1, padding: 16, backgroundColor: colors.bg },
    // Same title treatment as the chores tab — the tab name set quietly at the
    // top rather than a centred, tracked-out label.
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
      marginBottom: 16,
    },
    stats: {
      fontFamily: fonts.bold,
      textAlign: "center",
      fontSize: typeScale.caption,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.textMuted,
      marginTop: 16,
      marginBottom: 16,
    },
    flex1: { flex: 1 },
    empty: { fontFamily: fonts.regular, textAlign: "center", color: colors.textMuted, marginBottom: 16 },

    // ── The summary tile ──
    // Shares the dashboard tile's geometry: 24pt radius, no border (the fill is
    // the shape), and a soft shadow rather than an outline.
    heroCard: {
      borderRadius: 24,
      padding: 16,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    // Explicit lineHeight throughout: a line box left to the font's own metrics
    // differs per platform, and these blocks are tuned to a fixed rhythm.
    heroValue: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, letterSpacing: -1.2, marginTop: 12 },
    heroCaption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, marginTop: 4 },

    facePile: { flexDirection: "row", alignItems: "center" },
    faceMore: { width: FACE, height: FACE, borderRadius: FACE / 2, alignItems: "center", justifyContent: "center" },
    faceMoreText: { fontFamily: fonts.bold, fontSize: 11 },

    // ── The block-coloured balance card ──
    // Deliberately the chores roster card: full column width, one header tall
    // collapsed, and the chip row clips instead of wrapping to keep it that way.
    balanceCard: { borderRadius: 12, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 10 },
    balanceCardPressed: { transform: [{ scale: 0.98 }] },
    cardHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      height: CARD_HEADER_HEIGHT,
    },
    cardInfo: { flex: 1 },
    cardName: { fontFamily: fonts.display, fontSize: 26, textTransform: "uppercase", letterSpacing: -1 },
    cardSubtitle: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: -0.3, marginTop: 2 },
    cardAmountBlock: { alignItems: "flex-end", gap: 6 },
    settleButton: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
    settleButtonBusy: { opacity: 0.5 },
    settleButtonText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.4 },

    // ── Drop-down detail ──
    details: { width: "100%", marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
    detailRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
    },
    detailRowLast: { borderBottomWidth: 0 },
    detailName: { fontFamily: fonts.bold, fontSize: 12, textTransform: "uppercase", letterSpacing: -0.3 },
    detailMeta: { fontFamily: fonts.regular, fontSize: 10, marginTop: 3, lineHeight: 14 },
    detailAmount: { fontFamily: fonts.bold, fontSize: 13 },

    // ── The collapsed ledger and history, built to the chores tab's
    //    "All chores" section so the two tabs share one filing pattern. ──
    manageTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 28,
      marginBottom: 4,
      paddingVertical: 4,
    },
    manageTitle: { fontFamily: fonts.display, fontSize: typeScale.subheading, letterSpacing: 1, color: colors.text },
    // Sits next to the title so the collapsed section still says how much is
    // behind it.
    manageCount: { flex: 1, fontFamily: fonts.bold, fontSize: typeScale.caption, color: colors.textMuted },
    groupLabel: {
      fontFamily: fonts.bold,
      fontSize: typeScale.caption,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      color: colors.textMuted,
      marginTop: 14,
      marginBottom: 6,
    },
    manageCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      marginBottom: 8,
    },
    manageCardHeader: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
    manageItemName: { fontFamily: fonts.bold, fontSize: typeScale.body, color: colors.text },
    manageItemMeta: {
      fontFamily: fonts.regular,
      fontSize: typeScale.caption,
      color: colors.textMuted,
      marginTop: 2,
    },
    settledAmount: { fontFamily: fonts.bold, fontSize: typeScale.body, color: colors.textMuted },
    iconButton: { padding: 6 },
  });
}
