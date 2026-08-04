import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Switch, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import * as flatService from "../services/flatService";
import * as choresService from "../services/choresService";
import { ApiError } from "../services/apiClient";
import { requestCompletionAlertPermission } from "../notifications/completionAlerts";
import { getCompletionAlertsEnabled, setCompletionAlertsEnabled } from "../storage/preferences";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import { initialsFor } from "../utils/initials";
import type { Chore, Frequency } from "../types";

const COLORS = ["#EF4444", "#F97316", "#EAB308", "#22C55E", "#0EA5E9", "#6366F1", "#A855F7", "#EC4899"];
const FREQUENCIES: Frequency[] = ["Daily", "Weekly", "Monthly"];

type MenuKey = "account" | "flatmates" | "invite" | "chores";

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
// Flatmates, Invite Flatmates, Chore List) that used to live on the House
// tab — House now only shows the weekly chore-assignment cards.
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { colors, scheme, setScheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentUser, userFlat, logout, leaveFlat, refreshFlat, updateDisplayName } = useAuth();
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const choreFormEndRef = useRef<View>(null);
  const scrollYRef = useRef(0);

  const [chores, setChores] = useState<Chore[]>([]);
  const [displayNameInput, setDisplayNameInput] = useState(currentUser?.displayName ?? "");
  const [flatName, setFlatName] = useState(userFlat?.name ?? "");
  const [inviteEmail, setInviteEmail] = useState("");
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const [expandedChoreId, setExpandedChoreId] = useState<string | null>(null);
  const [showChoreForm, setShowChoreForm] = useState(false);

  const [editingChoreId, setEditingChoreId] = useState<string | null>(null);
  const [newChoreName, setNewChoreName] = useState("");
  const [newChoreDescription, setNewChoreDescription] = useState("");
  const [newChoreFrequency, setNewChoreFrequency] = useState<Frequency>("Weekly");
  const [newChoreMembers, setNewChoreMembers] = useState<string[]>([]);

  const loadChores = useCallback(async () => {
    if (!userFlat) return;
    const { chores } = await choresService.fetchChores(userFlat.id);
    setChores(chores);
  }, [userFlat]);

  useFocusEffect(
    useCallback(() => {
      getCompletionAlertsEnabled().then(setAlertsEnabled);
      loadChores();
      setFlatName(userFlat?.name ?? "");
      setDisplayNameInput(currentUser?.displayName ?? "");
    }, [loadChores, userFlat?.name, currentUser?.displayName]),
  );

  if (!currentUser || !userFlat) return null;

  const myColor = userFlat.members.find((m) => m.userId === currentUser.id)?.color ?? null;

  const pickColor = async (color: string) => {
    await flatService.updateMemberColor(userFlat.id, color);
    await refreshFlat();
  };

  const onToggleAlerts = async (value: boolean) => {
    if (value) {
      const granted = await requestCompletionAlertPermission();
      if (!granted) {
        Alert.alert("Permission needed", "Enable notifications in system settings to turn this on.");
        return;
      }
    }
    setAlertsEnabled(value);
    await setCompletionAlertsEnabled(value);
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

  const toggleNewChoreMember = (userId: string) => {
    setNewChoreMembers((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const resetChoreForm = () => {
    setEditingChoreId(null);
    setNewChoreName("");
    setNewChoreDescription("");
    setNewChoreFrequency("Weekly");
    setNewChoreMembers([]);
    setShowChoreForm(false);
  };

  const scrollToChoreFormEnd = () => {
    setTimeout(() => {
      const scrollView = scrollRef.current;
      const marker = choreFormEndRef.current;
      if (!scrollView || !marker) return;
      (scrollView as unknown as View).measure((_sx, _sy, _sw, scrollHeight, _spx, scrollPageY) => {
        marker.measureInWindow((_mpx, markerPageY, _mw, markerHeight) => {
          const overflow = markerPageY + markerHeight - (scrollPageY + scrollHeight);
          if (overflow > 0) {
            scrollView.scrollTo({ y: scrollYRef.current + overflow + 16, animated: true });
          }
        });
      });
    }, 150);
  };

  const openChoreForm = () => {
    setShowChoreForm(true);
    scrollToChoreFormEnd();
  };

  const startEditChore = (chore: Chore) => {
    setEditingChoreId(chore.id);
    setNewChoreName(chore.name);
    setNewChoreDescription(chore.description ?? "");
    setNewChoreFrequency(chore.frequency);
    setNewChoreMembers(chore.memberIds);
    setShowChoreForm(true);
    scrollToChoreFormEnd();
  };

  const submitChoreForm = async () => {
    if (!newChoreName.trim()) return;
    const payload = {
      name: newChoreName.trim(),
      description: newChoreDescription.trim(),
      frequency: newChoreFrequency,
      memberIds: newChoreMembers,
    };
    if (editingChoreId) {
      await choresService.updateChore(userFlat.id, editingChoreId, payload);
    } else {
      await choresService.addChore(userFlat.id, payload);
    }
    resetChoreForm();
    await loadChores();
  };

  const deleteChore = async (choreId: string) => {
    await choresService.deleteChore(userFlat.id, choreId);
    if (editingChoreId === choreId) resetChoreForm();
    if (expandedChoreId === choreId) setExpandedChoreId(null);
    await loadChores();
  };

  const choresByFrequency = FREQUENCIES.map((freq) => ({
    freq,
    items: chores.filter((c) => c.frequency === freq),
  })).filter((g) => g.items.length > 0);

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
            {COLORS.map((color) => (
              <Pressable
                key={color}
                style={[styles.colorSwatch, { backgroundColor: color }, myColor === color && styles.colorSwatchActive]}
                onPress={() => pickColor(color)}
              />
            ))}
          </View>

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

      <MenuHeader title="Chore List" open={openMenu === "chores"} onPress={() => toggleMenu("chores")} styles={styles} />
      {openMenu === "chores" && (
        <View style={styles.menuBody}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Completion alerts</Text>
            <Switch
              value={alertsEnabled}
              onValueChange={onToggleAlerts}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>

          {!showChoreForm && (
            <Pressable style={styles.addChoreButton} onPress={openChoreForm}>
              <Text style={styles.addChoreButtonText}>+ Add New Chore</Text>
            </Pressable>
          )}

          {showChoreForm && (
          <View style={styles.formCard}>
            <Text style={styles.formFieldLabel}>{editingChoreId ? "Edit chore" : "Chore name"}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.inputText}
                placeholder="e.g. Vacuum living room"
                placeholderTextColor={colors.textMuted}
                value={newChoreName}
                onChangeText={setNewChoreName}
              />
            </View>

            <Text style={styles.formFieldLabel}>Frequency</Text>
            <View style={styles.freqSelector}>
              {FREQUENCIES.map((freq) => (
                <Pressable
                  key={freq}
                  style={[styles.freqBtn, newChoreFrequency === freq && styles.freqBtnActive]}
                  onPress={() => setNewChoreFrequency(freq)}
                >
                  <Text style={[styles.freqBtnText, newChoreFrequency === freq && styles.freqBtnTextActive]}>
                    {freq}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.formFieldLabel}>Rotation members</Text>
            <View style={styles.choreFormChips}>
              {userFlat.members.map((m) => {
                const active = newChoreMembers.includes(m.userId);
                return (
                  <Pressable
                    key={m.userId}
                    style={[styles.choreFormChip, active && { backgroundColor: m.color ?? colors.accent, borderColor: "transparent" }]}
                    onPress={() => toggleNewChoreMember(m.userId)}
                  >
                    <Text style={[styles.choreFormChipText, active && styles.choreFormChipTextActive]}>
                      {m.displayName}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                style={[styles.choreFormChip, newChoreMembers.length === 0 && styles.choreFormChipAllActive]}
                onPress={() => setNewChoreMembers([])}
              >
                <Text style={styles.choreFormChipText}>All</Text>
              </Pressable>
            </View>

            <Text style={styles.formFieldLabel}>Description</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.inputText, styles.descriptionInput]}
                placeholder="What needs to be done? (optional)"
                placeholderTextColor={colors.textMuted}
                value={newChoreDescription}
                onChangeText={setNewChoreDescription}
                multiline
              />
            </View>

            <Pressable style={styles.primaryButton} onPress={submitChoreForm}>
              <Text style={styles.primaryButtonText}>{editingChoreId ? "Save changes" : "Add chore"}</Text>
            </Pressable>
            <Pressable style={styles.ghostButton} onPress={resetChoreForm}>
              <Text style={styles.ghostButtonText}>Cancel</Text>
            </Pressable>
            <View ref={choreFormEndRef} />
          </View>
          )}

          {choresByFrequency.length === 0 && <Text style={styles.emptyChores}>No chores yet.</Text>}
          {choresByFrequency.map(({ freq, items }) => (
            <View key={freq}>
              <Text style={styles.groupLabel}>{freq}</Text>
              {items.map((chore) => {
                const expanded = expandedChoreId === chore.id;
                const choreMembers = userFlat.members.filter((m) => chore.memberIds.includes(m.userId));
                return (
                  <View key={chore.id} style={styles.choreCard}>
                    <Pressable
                      style={styles.choreCardHeader}
                      onPress={() => setExpandedChoreId(expanded ? null : chore.id)}
                    >
                      <View style={styles.flex1}>
                        <Text style={styles.choreName}>{chore.name}</Text>
                        <View style={styles.choreFreqBadge}>
                          <Text style={styles.choreFreqBadgeText}>{chore.frequency}</Text>
                        </View>
                      </View>
                      <View style={styles.choreActions}>
                        <Pressable style={styles.iconButton} onPress={() => startEditChore(chore)} hitSlop={8}>
                          <Ionicons name="pencil" size={13} color={colors.textMuted} />
                        </Pressable>
                        <Pressable style={styles.iconButton} onPress={() => deleteChore(chore.id)} hitSlop={8}>
                          <Ionicons name="trash-outline" size={13} color={colors.danger} />
                        </Pressable>
                        <Text style={styles.chevron}>{expanded ? "−" : "+"}</Text>
                      </View>
                    </Pressable>
                    {expanded && (
                      <View style={styles.choreCardBody}>
                        {chore.description?.trim() ? (
                          <Text style={styles.choreDescription}>{chore.description}</Text>
                        ) : (
                          <Text style={styles.choreDescEmpty}>No description.</Text>
                        )}
                        {choreMembers.length > 0 ? (
                          <View style={styles.choreMemberRow}>
                            {choreMembers.map((m) => (
                              <View key={m.userId} style={[styles.choreMemberChip, { backgroundColor: m.color ?? colors.accent }]}>
                                <Text style={styles.choreMemberChipText}>{m.displayName}</Text>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text style={styles.choreDescEmpty}>All flatmates.</Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}

      <Pressable style={styles.dangerButton} onPress={confirmLeaveFlat}>
        <Text style={styles.dangerButtonText}>Leave flat</Text>
      </Pressable>

      <Pressable style={styles.signOutButton} onPress={() => logout()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
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
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  settingLabel: { fontFamily: fonts.regular, fontSize: typeScale.body, color: colors.text },
  dangerButton: { borderWidth: 1, borderColor: colors.danger, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 32 },
  dangerButtonText: { fontFamily: fonts.bold, color: colors.danger, fontSize: typeScale.body },
  signOutButton: { padding: 14, alignItems: "center", marginTop: 12, marginBottom: 32 },
  signOutText: { fontFamily: fonts.bold, color: colors.textMuted, fontSize: typeScale.body },

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
  inputText: { fontFamily: fonts.bold, color: colors.text, fontSize: typeScale.body, paddingVertical: 8 },
  descriptionInput: { minHeight: 60, textAlignVertical: "top" },
  smallButton: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
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
  memberName: { fontFamily: fonts.bold, fontSize: typeScale.body, letterSpacing: 0.3, textTransform: "uppercase", color: "rgba(0,0,0,0.75)" },
  groupLabel: { fontFamily: fonts.bold, fontSize: typeScale.caption, letterSpacing: 1.5, color: colors.textMuted, textTransform: "uppercase", marginTop: 12, marginBottom: 4 },
  addChoreButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  addChoreButtonText: {
    fontFamily: fonts.bold,
    color: colors.accentText,
    fontSize: typeScale.caption,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  emptyChores: {
    fontFamily: fonts.bold,
    fontSize: typeScale.caption,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: 12,
  },
  choreCard: { backgroundColor: colors.surface, borderRadius: 12, marginBottom: 8, overflow: "hidden" },
  choreCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  choreActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  choreName: { fontFamily: fonts.bold, fontSize: typeScale.body, textTransform: "uppercase", letterSpacing: 0.3, color: colors.text, marginBottom: 4 },
  choreFreqBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  choreFreqBadgeText: { fontFamily: fonts.bold, fontSize: typeScale.caption, letterSpacing: 1, textTransform: "uppercase", color: colors.accent },
  iconButton: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  chevron: { fontFamily: fonts.bold, fontSize: typeScale.body, color: colors.textMuted, width: 14, textAlign: "center" },
  choreCardBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  choreDescription: { fontFamily: fonts.bold, fontSize: typeScale.body, color: colors.textMuted, lineHeight: 18 },
  choreDescEmpty: { fontFamily: fonts.bold, fontSize: typeScale.caption, textTransform: "uppercase", letterSpacing: 1, color: colors.textMuted },
  choreMemberRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  choreMemberChip: { borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 },
  choreMemberChipText: { fontFamily: fonts.bold, fontSize: typeScale.caption, textTransform: "uppercase", letterSpacing: 0.3, color: "rgba(0,0,0,0.75)" },
  formCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginTop: 4, gap: 4 },
  formFieldLabel: { fontFamily: fonts.bold, fontSize: typeScale.caption, textTransform: "uppercase", letterSpacing: 1.5, color: colors.textMuted, marginTop: 10, marginBottom: 6 },
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
  schemeBtnTextActive: { color: colors.accentText },
  freqSelector: { flexDirection: "row", gap: 6 },
  freqBtn: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  freqBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  freqBtnText: { fontFamily: fonts.bold, fontSize: typeScale.caption, textTransform: "uppercase", letterSpacing: 0.5, color: colors.textMuted },
  freqBtnTextActive: { color: colors.accentText },
  choreFormChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  choreFormChip: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  choreFormChipText: { fontFamily: fonts.bold, fontSize: typeScale.caption, textTransform: "uppercase", letterSpacing: 0.5, color: colors.textMuted },
  choreFormChipTextActive: { color: "rgba(0,0,0,0.75)" },
  choreFormChipAllActive: { backgroundColor: colors.border, borderColor: colors.inputBorder },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 12, padding: 12, alignItems: "center", marginTop: 12 },
  primaryButtonText: { fontFamily: fonts.bold, color: colors.accentText, fontSize: typeScale.caption, textTransform: "uppercase", letterSpacing: 1 },
  ghostButton: { backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 12, alignItems: "center", marginTop: 8 },
  ghostButtonText: { fontFamily: fonts.bold, color: colors.textMuted, fontSize: typeScale.caption, textTransform: "uppercase", letterSpacing: 1 },
  });
}
