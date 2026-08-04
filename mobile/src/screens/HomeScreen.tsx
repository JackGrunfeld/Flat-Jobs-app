import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Animated } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import * as choresService from "../services/choresService";
import * as completionsService from "../services/completionsService";
import * as shoppingService from "../services/shoppingService";
import * as settlementsService from "../services/settlementsService";
import { useTypewriterCycle } from "../hooks/useTypewriterCycle";
import { getCurrentWeek, getPeriodIndex } from "../utils/rosterHelpers";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import SettingsButton from "../components/SettingsButton";
import type { MainTabParamList } from "../navigation/MainTabNavigator";
import type { Chore, Completion, ShoppingItem, Balance } from "../types";

type Segment = { text: string; bold?: boolean };
type Nav = BottomTabNavigationProp<MainTabParamList>;
type TileTone = { fg: string; soft: string };

const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function periodForHour(hour: number) {
  if (hour < 5) return "evening";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function buildGreetingSegments(period: string, firstName: string): Segment[] {
  const segments: Segment[] = [{ text: `Good ${period}` }];
  if (firstName) segments.push({ text: ", " }, { text: firstName, bold: true });
  return segments;
}

// Staggered fade-up on mount/focus — each tile waits `delay` ms before
// tweening in, so the dashboard reveals itself tile-by-tile instead of
// popping in as a flat block.
function RevealTile({ delay, children }: { delay: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 420, delay, useNativeDriver: true }).start();
    }, [anim, delay]),
  );

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function StatTile({
  icon,
  label,
  stat,
  caption,
  tone,
  wide,
  onPress,
  styles,
  mutedColor,
}: {
  icon: React.ReactNode;
  label: string;
  stat: string;
  caption: string;
  tone: TileTone;
  wide?: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  mutedColor: string;
}) {
  return (
    <Pressable style={[styles.tile, wide && styles.tileWide, { borderColor: tone.soft }]} onPress={onPress}>
      <View style={styles.tileTopRow}>
        <View style={[styles.tileIcon, { backgroundColor: tone.soft }]}>{icon}</View>
        <Ionicons name="arrow-forward" size={14} color={mutedColor} />
      </View>
      <Text style={[styles.tileLabel, { color: tone.fg }]}>{label}</Text>
      <Text style={[styles.tileStat, { color: tone.fg }]}>{stat}</Text>
      <Text style={styles.tileCaption}>{caption}</Text>
    </Pressable>
  );
}

// Top-of-screen typed greeting (same SpaceMono treatment as AuthScreen's
// subtitle), a rotating one-line status ticker built from whatever actually
// needs attention, then a grid of tappable stat tiles — chores assigned to
// the signed-in user this week, their net balance, and the shopping list —
// each colour-coded and routing into the tab it summarises.
export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentUser, userFlat } = useAuth();

  const firstName = currentUser?.displayName?.trim().split(/\s+/)[0] ?? "";
  const segments = buildGreetingSegments(periodForHour(new Date().getHours()), firstName);
  const totalLength = segments.reduce((sum, seg) => sum + seg.text.length, 0);

  const [visibleChars, setVisibleChars] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);

  const [chores, setChores] = useState<Chore[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);

  const load = useCallback(async () => {
    if (!userFlat) return;
    const [choresRes, completionsRes, itemsRes, balancesRes] = await Promise.all([
      choresService.fetchChores(userFlat.id),
      completionsService.fetchCompletions(userFlat.id),
      shoppingService.fetchShoppingItems(userFlat.id),
      settlementsService.fetchBalances(userFlat.id),
    ]);
    setChores(choresRes.chores);
    setCompletions(completionsRes.completions);
    setItems(itemsRes.items);
    setBalances(balancesRes.balances);
  }, [userFlat]);

  useFocusEffect(
    useCallback(() => {
      setVisibleChars(0);
      load();
    }, [load]),
  );

  useEffect(() => {
    if (visibleChars >= totalLength) return;
    const timer = setTimeout(() => setVisibleChars((c) => c + 1), 45);
    return () => clearTimeout(timer);
  }, [visibleChars, totalLength]);

  useEffect(() => {
    const blink = setInterval(() => setCursorOn((v) => !v), 500);
    return () => clearInterval(blink);
  }, []);

  const myChoreStats = useMemo(() => {
    if (!userFlat || !currentUser) return { total: 0, done: 0 };
    const week = getCurrentWeek();
    const flatMemberIds = userFlat.members.map((m) => m.userId);
    const completionByChoreWeek = new Map(completions.map((c) => [`${c.choreId}:${c.week}`, c]));
    let total = 0;
    let done = 0;
    for (const chore of chores) {
      const pool = chore.memberIds.length > 0 ? chore.memberIds : flatMemberIds;
      const periodIndex = getPeriodIndex(chore.frequency, week);
      const assignedUserId = pool.length > 0 ? pool[periodIndex % pool.length] : null;
      if (assignedUserId !== currentUser.id) continue;
      total += 1;
      if (completionByChoreWeek.get(`${chore.id}:${week}`)?.done) done += 1;
    }
    return { total, done };
  }, [chores, completions, userFlat, currentUser]);

  const moneySummary = useMemo(() => {
    if (!currentUser) return { owe: 0, owed: 0 };
    const owe = balances.filter((b) => b.userId === currentUser.id).reduce((sum, b) => sum + b.amountCents, 0);
    const owed = balances.filter((b) => b.owesUserId === currentUser.id).reduce((sum, b) => sum + b.amountCents, 0);
    return { owe, owed };
  }, [balances, currentUser]);

  const choresLeft = myChoreStats.total - myChoreStats.done;

  // Only the things actually worth mentioning make the cut — the ticker
  // never nags about a fully caught-up flat, it just says so.
  const nudges = useMemo(() => {
    const list: string[] = [];
    if (choresLeft > 0) list.push(`${choresLeft} chore${choresLeft === 1 ? "" : "s"} waiting on you`);
    if (moneySummary.owe > 0) list.push(`Someone's owed ${formatMoney(moneySummary.owe)}`);
    if (moneySummary.owed > 0) list.push(`You're owed ${formatMoney(moneySummary.owed)} — chase it down`);
    if (items.length === 0) list.push("Fridge check — the list is empty");
    if (list.length === 0) list.push("All caught up. Flat's in good shape.");
    return list;
  }, [choresLeft, moneySummary, items.length]);

  const { text: nudgeText, cursorOn: nudgeCursorOn } = useTypewriterCycle(nudges, { pauseMs: 2200 });

  if (!userFlat || !currentUser) return null;

  let consumed = 0;
  const greetingNodes: React.ReactNode[] = segments.map((seg, idx) => {
    const shown = seg.text.slice(0, Math.max(0, Math.min(visibleChars - consumed, seg.text.length)));
    consumed += seg.text.length;
    return seg.bold ? (
      <Text key={idx} style={styles.greetingName}>
        {shown}
      </Text>
    ) : (
      shown
    );
  });

  const choreTone: TileTone =
    myChoreStats.total === 0
      ? { fg: colors.textMuted, soft: colors.surfaceAlt }
      : choresLeft === 0
        ? { fg: colors.success, soft: colors.successSoft }
        : { fg: colors.accent, soft: colors.accentSoft };
  const choreStat = myChoreStats.total === 0 ? "—" : `${myChoreStats.done}/${myChoreStats.total}`;
  const choreCaption =
    myChoreStats.total === 0
      ? "Nothing assigned. Lucky you."
      : choresLeft === 0
        ? "All caught up. Legend."
        : `${choresLeft} chore${choresLeft === 1 ? "" : "s"} left this week`;

  const balanceTone: TileTone =
    moneySummary.owe > 0
      ? { fg: colors.danger, soft: colors.dangerSoft }
      : moneySummary.owed > 0
        ? { fg: colors.success, soft: colors.successSoft }
        : { fg: colors.textMuted, soft: colors.surfaceAlt };
  const balanceStat =
    moneySummary.owe > 0
      ? formatMoney(moneySummary.owe)
      : moneySummary.owed > 0
        ? formatMoney(moneySummary.owed)
        : "$0.00";
  const balanceCaption =
    moneySummary.owe > 0 ? "Time to settle up" : moneySummary.owed > 0 ? "Cha-ching — come collect" : "Squeaky clean";

  const shoppingTone: TileTone = items.length === 0 ? { fg: colors.textMuted, soft: colors.surfaceAlt } : { fg: colors.info, soft: colors.infoSoft };
  const shoppingCaption = items.length === 0 ? "Cart's empty" : `item${items.length === 1 ? "" : "s"} on the list`;

  return (
    <View style={styles.root}>
      <ScrollView style={[styles.container, { paddingTop: insets.top + 60 }]}>
        <Text style={styles.greeting}>
          {greetingNodes}
          <Text style={[styles.cursor, { opacity: cursorOn ? 1 : 0 }]}>▌</Text>
        </Text>

        <Text style={styles.nudge}>
          {nudgeText}
          <Text style={[styles.cursor, { opacity: nudgeCursorOn ? 1 : 0 }]}>▌</Text>
        </Text>

        <Text style={styles.overviewLabel}>The Lowdown</Text>

        <View style={styles.grid}>
          <RevealTile delay={0}>
            <StatTile
              icon={<MaterialCommunityIcons name="broom" size={18} color={choreTone.fg} />}
              label="Chores"
              stat={choreStat}
              caption={choreCaption}
              tone={choreTone}
              onPress={() => navigation.navigate("House")}
              styles={styles}
              mutedColor={colors.textMuted}
            />
          </RevealTile>
          <RevealTile delay={80}>
            <StatTile
              icon={<Ionicons name="cash-outline" size={18} color={balanceTone.fg} />}
              label="Balance"
              stat={balanceStat}
              caption={balanceCaption}
              tone={balanceTone}
              onPress={() => navigation.navigate("Splitwise")}
              styles={styles}
              mutedColor={colors.textMuted}
            />
          </RevealTile>
        </View>

        <RevealTile delay={160}>
          <StatTile
            icon={<Ionicons name="cart-outline" size={18} color={shoppingTone.fg} />}
            label="Shopping list"
            stat={String(items.length)}
            caption={shoppingCaption}
            tone={shoppingTone}
            wide
            onPress={() => navigation.navigate("Shopping")}
            styles={styles}
            mutedColor={colors.textMuted}
          />
        </RevealTile>
      </ScrollView>
      <SettingsButton />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  greeting: {
    fontFamily: fonts.regular,
    fontSize: 24,
    letterSpacing: 3,
    color: colors.textMuted,
  },
  greetingName: { fontFamily: fonts.bold, color: colors.text },
  cursor: { fontFamily: fonts.bold, color: colors.accent },
  nudge: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 0.5,
    color: colors.accent,
    marginTop: 10,
  },
  overviewLabel: {
    fontFamily: fonts.display,
    fontSize: 15,
    letterSpacing: 1,
    color: colors.text,
    marginTop: 36,
    marginBottom: 10,
  },
  grid: { flexDirection: "row", gap: 10 },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    gap: 6,
    marginBottom: 10,
  },
  tileWide: { flex: undefined },
  tileTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 4 },
  tileStat: { fontFamily: fonts.display, fontSize: 26 },
  tileCaption: { fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted },
  });
}
