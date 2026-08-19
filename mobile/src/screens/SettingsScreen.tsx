import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, Linking, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import * as flatService from "../services/flatService";
import { ApiError } from "../services/apiClient";
import { API_BASE_URL } from "../config/env";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import { initialsFor } from "../utils/initials";
import { MEMBER_PRESETS } from "../theme/pastels";
import PastelColorWheel from "../components/PastelColorWheel";
import TermsModal from "../components/TermsModal";

type MenuKey = "account" | "flatmates" | "invite";

function MenuHeader({
  title,
  open,
  onPress,
  styles,
}: {
  title: string;
  open: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable style={styles.sectionHeader} onPress={onPress}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
      <Text style={styles.sectionToggle}>{open ? "−" : "+"}</Text>
    </Pressable>
  );
}

// Account/colour/notifications/sign-out, plus the flat config menus (Flat,
// Flatmates, Invite Flatmates). Chore management used to live here too; it
// now sits on the Chores tab behind the tab bar's "+".
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { colors, scheme, setScheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentUser, userFlat, logout, deleteAccount, leaveFlat, refreshFlat, updateDisplayName } = useAuth();
  const [termsVisible, setTermsVisible] = useState(false);
  // Guards the delete button against a second tap while the request is in
  // flight — the first one takes the account with it.
  const [deleting, setDeleting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);

  const [displayNameInput, setDisplayNameInput] = useState(currentUser?.displayName ?? "");
  const [flatName, setFlatName] = useState(userFlat?.name ?? "");
  const [inviteEmail, setInviteEmail] = useState("");
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const [showColorWheel, setShowColorWheel] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  // The screen pads 16 a side and the menu body another 2 — the rest is the
  // wheel's, capped so it doesn't balloon on tablets.
  const wheelSize = Math.min(windowWidth - 36, 320);

  useFocusEffect(
    useCallback(() => {
      setFlatName(userFlat?.name ?? "");
      setDisplayNameInput(currentUser?.displayName ?? "");
    }, [userFlat?.name, currentUser?.displayName]),
  );

  if (!currentUser || !userFlat) return null;

  const myColor = userFlat.members.find((m) => m.userId === currentUser.id)?.color ?? null;
  // Colours stored before the pastel switch may be any casing, so match loosely.
  const isMyColor = (color: string) => myColor?.toLowerCase() === color.toLowerCase();

  const pickColor = async (color: string) => {
    await flatService.updateMemberColor(userFlat.id, color);
    await refreshFlat();
  };

  const confirmLeaveFlat = () => {
    Alert.alert(
      "Leave flat?",
      "You'll need a new invite or flat code to rejoin.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: () => leaveFlat() },
      ],
    );
  };

  // Served by the Worker alongside the API (workers/src/routes/legal.ts), so
  // it's the same URL given to App Store Connect.
  const openPrivacyPolicy = () => {
    Linking.openURL(`${API_BASE_URL}/privacy`).catch(() =>
      Alert.alert("Couldn't open the policy", "Check your connection and try again."),
    );
  };

  // Chore digests and the "X ticked off Y" pushes are all system
  // notifications, so this is the one place they can be turned off.
  const openNotificationSettings = () => {
    Linking.openSettings().catch(() =>
      Alert.alert("Couldn't open settings", "Open Settings › Notifications › Flatr to change this."),
    );
  };

  const runDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      // Signs the session out as part of the same call, so RootNavigator
      // drops back to the auth screen on its own — nothing to navigate here.
      await deleteAccount();
    } catch (err) {
      setDeleting(false);
      Alert.alert(
        "Couldn't delete your account",
        err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      );
    }
  };

  // Asked twice on purpose. The first alert is the one that has to say what
  // actually happens — that it takes the expenses and balances with it — and
  // the second exists so the destructive button can't be hit by accident from
  // a list of ordinary settings rows.
  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete your account?",
      "This permanently deletes your profile and everything you've added — expenses, events, list items and settle-ups. Any balance between you and your flatmates goes with it, so settle up first if you need to.\n\nYour flat itself stays for whoever's left in it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () =>
            Alert.alert("This can't be undone", "Delete your Flatr account permanently?", [
              { text: "Cancel", style: "cancel" },
              { text: "Delete permanently", style: "destructive", onPress: runDeleteAccount },
            ]),
        },
      ],
    );
  };

  const toggleMenu = (key: MenuKey) => setOpenMenu((prev) => (prev === key ? null : key));

  const saveFlatName = async () => {
    if (!flatName.trim() || flatName === userFlat.name) return;
    await flatService.updateFlatName(userFlat.id, flatName.trim());
    await refreshFlat();
  };

  const saveDisplayName = async () => {
    if (!displayNameInput.trim() || displayNameInput.trim() === currentUser.displayName) return;
    await updateDisplayName(displayNameInput.trim());
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      await flatService.inviteByEmail(userFlat.id, inviteEmail.trim());
      setInviteEmail("");
      await refreshFlat();
      Alert.alert("Invite sent", `${inviteEmail.trim()} can now join with your flat code.`);
    } catch (err) {
      Alert.alert("Couldn't send invite", err instanceof ApiError ? err.message : "Try again.");
    }
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { paddingTop: insets.top + 16 }]}
      onScroll={(e) => {
        scrollYRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
    >
      <Pressable style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={10}>
        <Ionicons name="chevron-back" size={16} color={colors.textMuted} />
        <Text style={styles.backButtonText}>Back</Text>
      </Pressable>
      <Text style={styles.pageTitle}>Settings</Text>

      <MenuHeader title="Account" open={openMenu === "account"} onPress={() => toggleMenu("account")} styles={styles} />
      {openMenu === "account" && (
        <View style={styles.menuBody}>
          <Text style={styles.formFieldLabel}>Name</Text>
          <View style={styles.row}>
            <View style={[styles.inputRow, styles.flex1]}>
              <TextInput
                style={styles.inputText}
                value={displayNameInput}
                onChangeText={setDisplayNameInput}
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <Pressable style={styles.smallButton} onPress={saveDisplayName}>
              <Text style={styles.smallButtonText}>Save</Text>
            </Pressable>
          </View>
          <Text style={styles.email}>{currentUser.email}</Text>

          <Text style={styles.formFieldLabel}>Your colour</Text>
          <View style={styles.colorRow}>
            {MEMBER_PRESETS.map((color) => (
              <Pressable
                key={color}
                style={[styles.colorSwatch, { backgroundColor: color }, isMyColor(color) && styles.colorSwatchActive]}
                onPress={() => pickColor(color)}
              />
            ))}
            {/* A colour picked off the wheel isn't in the row above, so show it
                on the end — otherwise the current choice vanishes once the
                wheel is collapsed. */}
            {myColor && !MEMBER_PRESETS.some(isMyColor) && (
              <View style={[styles.colorSwatch, styles.colorSwatchActive, { backgroundColor: myColor }]} />
            )}
            <Pressable
              style={[styles.colorSwatch, styles.colorWheelToggle]}
              onPress={() => setShowColorWheel((prev) => !prev)}
            >
              <Ionicons
                name={showColorWheel ? "close" : "color-palette-outline"}
                size={18}
                color={colors.textMuted}
              />
            </Pressable>
          </View>
          {showColorWheel && (
            <View style={styles.colorWheelWrap}>
              <PastelColorWheel
                size={wheelSize}
                value={myColor}
                onSelect={pickColor}
                selectedBorderColor={colors.text}
              />
            </View>
          )}

          <Text style={styles.formFieldLabel}>Appearance</Text>
          <View style={styles.schemeSelector}>
            {(["dark", "light"] as const).map((option) => {
              const active = scheme === option;
              return (
                <Pressable
                  key={option}
                  style={[styles.schemeBtn, active && styles.schemeBtnActive]}
                  onPress={() => setScheme(option)}
                >
                  <Ionicons
                    name={option === "dark" ? "moon" : "sunny"}
                    size={14}
                    color={active ? colors.accentText : colors.textMuted}
                  />
                  <Text style={[styles.schemeBtnText, active && styles.schemeBtnTextActive]}>{option}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.formFieldLabel}>Flat name</Text>
          <View style={styles.row}>
            <View style={[styles.inputRow, styles.flex1]}>
              <TextInput
                style={styles.inputText}
                value={flatName}
                onChangeText={setFlatName}
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <Pressable style={styles.smallButton} onPress={saveFlatName}>
              <Text style={styles.smallButtonText}>Save</Text>
            </Pressable>
          </View>
          <View style={styles.codeRow}>
            <Text style={styles.codeLabel}>Flat Code</Text>
            <Text style={styles.code}>{userFlat.code}</Text>
          </View>
        </View>
      )}

      <MenuHeader title="Flatmates" open={openMenu === "flatmates"} onPress={() => toggleMenu("flatmates")} styles={styles} />
      {openMenu === "flatmates" && (
        <View style={styles.menuBody}>
          {userFlat.members.map((m) => (
            <View key={m.userId} style={[styles.memberCard, { backgroundColor: m.color ?? colors.accent }]}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>{initialsFor(m.displayName)}</Text>
              </View>
              <Text style={styles.memberName}>{m.displayName}</Text>
            </View>
          ))}
        </View>
      )}

      <MenuHeader title="Invite Flatmates" open={openMenu === "invite"} onPress={() => toggleMenu("invite")} styles={styles} />
      {openMenu === "invite" && (
        <View style={styles.menuBody}>
          <View style={styles.row}>
            <View style={[styles.inputRow, styles.flex1]}>
              <TextInput
                style={styles.inputText}
                placeholder="flatmate@email.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={inviteEmail}
                onChangeText={setInviteEmail}
              />
            </View>
            <Pressable style={styles.smallButton} onPress={sendInvite}>
              <Text style={styles.smallButtonText}>Send</Text>
            </Pressable>
          </View>
          {userFlat.invitedEmails.length > 0 && (
            <>
              <Text style={styles.formFieldLabel}>Pending invites</Text>
              {userFlat.invitedEmails.map((email) => (
                <Text key={email} style={styles.invitedRow}>
                  {email}
                </Text>
              ))}
            </>
          )}
        </View>
      )}

      {/* Chore notifications are sent by the server to the whole flat now, so
          there is no in-app preference left to flip — the real switch is the
          OS permission, which is where this goes. */}
      <Pressable style={styles.settingRow} onPress={openNotificationSettings}>
        <Text style={styles.settingLabel}>Notifications</Text>
        <Ionicons name="open-outline" size={16} color={colors.textMuted} />
      </Pressable>

      {/* The terms have to stay reachable after sign-up, not just at the
          moment of acceptance — read-only here, so there's no second gate. */}
      <Pressable style={styles.settingRow} onPress={() => setTermsVisible(true)}>
        <Text style={styles.settingLabel}>Terms & Conditions</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>

      <Pressable style={styles.settingRow} onPress={openPrivacyPolicy}>
        <Text style={styles.settingLabel}>Privacy Policy</Text>
        <Ionicons name="open-outline" size={16} color={colors.textMuted} />
      </Pressable>

      <Pressable style={styles.dangerButton} onPress={confirmLeaveFlat}>
        <Text style={styles.dangerButtonText}>Leave flat</Text>
      </Pressable>

      <Pressable style={styles.signOutButton} onPress={() => logout()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      {/* Last thing on the page, and the only filled-red control in the app —
          it has to be findable (App Store guideline 5.1.1(v) requires it to
          be) without sitting anywhere near the buttons people use daily. */}
      <Pressable
        style={[styles.deleteButton, deleting && styles.deleteButtonBusy]}
        onPress={confirmDeleteAccount}
        disabled={deleting}
      >
        <Text style={styles.deleteButtonText}>{deleting ? "Deleting…" : "Delete account"}</Text>
      </Pressable>

      <TermsModal
        visible={termsVisible}
        readOnly
        onAccept={() => setTermsVisible(false)}
        onClose={() => setTermsVisible(false)}
      />
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.bg },
  backButton: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start", marginBottom: 8 },
  backButtonText: { fontFamily: fonts.bold, fontSize: typeScale.caption, textTransform: "uppercase", letterSpacing: 1, color: colors.textMuted },
  pageTitle: {
    fontFamily: fonts.regular,
    fontSize: typeScale.subheading,
    letterSpacing: 3,
    color: colors.textMuted,
    marginBottom: 16,
  },
  email: { fontFamily: fonts.regular, fontSize: typeScale.body, color: colors.textMuted, marginTop: 2 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  colorSwatch: { width: 36, height: 36, borderRadius: 18 },
  colorSwatchActive: { borderWidth: 3, borderColor: colors.text },
  colorWheelToggle: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  colorWheelWrap: { alignSelf: "center", marginTop: 14 },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  settingLabel: { fontFamily: fonts.regular, fontSize: typeScale.body, color: colors.text },
  dangerButton: { borderWidth: 1, borderColor: colors.danger, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 32 },
  dangerButtonText: { fontFamily: fonts.bold, color: colors.danger, fontSize: typeScale.body },
  signOutButton: { padding: 14, alignItems: "center", marginTop: 12 },
  signOutText: { fontFamily: fonts.bold, color: colors.textMuted, fontSize: typeScale.body },
  deleteButton: {
    backgroundColor: colors.danger,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 48,
  },
  deleteButtonBusy: { opacity: 0.6 },
  deleteButtonText: { fontFamily: fonts.bold, color: "#ffffff", fontSize: typeScale.body },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 10,
    marginTop: 18,
  },
  sectionHeaderText: { fontFamily: fonts.bold, fontSize: typeScale.body, letterSpacing: 2, textTransform: "uppercase", color: colors.textMuted },
  sectionToggle: { fontFamily: fonts.bold, fontSize: typeScale.body, color: colors.textMuted, width: 18, textAlign: "center" },
  menuBody: { paddingTop: 12, paddingHorizontal: 2, paddingBottom: 8, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  flex1: { flex: 1 },
  inputRow: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  inputText: { fontFamily: fonts.bold, color: colors.text, fontSize: typeScale.body, paddingVertical: 8 },  smallButton: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
  smallButtonText: { fontFamily: fonts.bold, color: colors.accentText, fontSize: typeScale.caption, letterSpacing: 1, textTransform: "uppercase" },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  codeLabel: { fontFamily: fonts.bold, fontSize: typeScale.caption, letterSpacing: 2, textTransform: "uppercase", color: colors.textMuted },
  code: { fontFamily: fonts.bold, fontSize: typeScale.body, letterSpacing: 5, color: colors.accent },
  invitedRow: { fontFamily: fonts.bold, fontSize: typeScale.body, paddingVertical: 3, color: colors.textMuted },
  memberCard: { flexDirection: "row", alignItems: "center", borderRadius: 12, padding: 12, gap: 12, marginTop: 8 },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  memberAvatarText: { fontFamily: fonts.bold, fontSize: typeScale.caption, color: "rgba(0,0,0,0.75)" },
  memberName: { fontFamily: fonts.bold, fontSize: typeScale.body, letterSpacing: 0.3, textTransform: "uppercase", color: "rgba(0,0,0,0.75)" },  formFieldLabel: { fontFamily: fonts.bold, fontSize: typeScale.caption, textTransform: "uppercase", letterSpacing: 1.5, color: colors.textMuted, marginTop: 10, marginBottom: 6 },
  schemeSelector: { flexDirection: "row", gap: 6 },
  schemeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
  },
  schemeBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  schemeBtnText: {
    fontFamily: fonts.bold,
    fontSize: typeScale.caption,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  schemeBtnTextActive: { color: colors.accentText },  });
}
