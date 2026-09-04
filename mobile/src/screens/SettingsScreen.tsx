import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "../context/AuthContext";
import * as flatService from "../services/flatService";
import type { HomeInfoFields } from "../services/flatService";
import { ApiError } from "../services/apiClient";
import { API_BASE_URL } from "../config/env";
import { useTheme } from "../context/ThemeContext";
import { CARD_TONES, CAL_PLATE, onColor, withAlpha } from "../theme/colors";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import { MEMBER_PRESETS } from "../theme/pastels";
import PastelColorWheel from "../components/PastelColorWheel";
import ProfileAvatar from "../components/ProfileAvatar";
import { useProfilePhoto } from "../hooks/useProfilePhoto";
import TermsModal from "../components/TermsModal";
import AddressAutocompleteInput from "../components/AddressAutocompleteInput";
import { useTour } from "../navigation/TourContext";
import TourOverlay from "../navigation/TourOverlay";

// Every collapsible section on the page — the three tile-style boxes (Home
// Info, Homies, Me) — shares this one key space, so opening any of them
// closes whichever other one was open rather than stacking.
type SectionKey = "homeInfo" | "homies" | "me" | "settings";

// Every tile on this page draws from the same four tones the Home tab's own
// mosaic uses (lime/indigo/lilac/plate) rather than introducing new hues —
// fixed across schemes like those tiles are, so each tone's ink is worked
// out once here instead of pulled from `colors`.
const LIME_FG = onColor(CARD_TONES.lime);
const LILAC_FG = onColor(CARD_TONES.lilac);
const INDIGO_FG = onColor(CARD_TONES.indigo);
const PLATE_FG = onColor(CAL_PLATE);
// The one deliberate exception to the four-tone system — Important Info
// keeps the stuck-on-a-fridge yellow it's always had, since that's the
// whole point of it standing out from the rest of the mosaic.
const YELLOW = "#FDE68A";
const YELLOW_FG = onColor(YELLOW);

const MOSAIC_GAP = 8;

// Fixed like the tile tones above — a save flashing green means the same
// thing regardless of which tile's colour it's sitting on.
const SAVED_COLOR = "#22C55E";
const SAVE_FLASH_MS = 1200;

// Every "Save" button on the page routes through this: tap it, it runs the
// save, then flips to a green "Saved" for a beat before reverting — so
// saving something actually says so, rather than looking identical whether
// it worked or you never tapped it. `onPress` can be async; the flash only
// starts once it resolves.
function SaveButton({
  onPress,
  style,
  textStyle,
  label = "Save",
}: {
  onPress: () => void | Promise<void>;
  style: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
  label?: string;
}) {
  const [saved, setSaved] = useState(false);

  const handlePress = async () => {
    if (saved) return;
    await onPress();
    setSaved(true);
    setTimeout(() => setSaved(false), SAVE_FLASH_MS);
  };

  return (
    <Pressable style={[style, saved && { backgroundColor: SAVED_COLOR }]} onPress={handlePress}>
      <Text style={[textStyle, saved && { color: "#ffffff" }]}>{saved ? "Saved" : label}</Text>
    </Pressable>
  );
}

type InfoLine = { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string };

// A quick-glance preview tile — label pill, then one icon+line per field
// that's actually been filled in, or a placeholder while none have. No
// fixed height and no numberOfLines cap: the tile grows to fit whatever's
// there rather than truncating it. `onPress` is only wired up on the Wifi
// tile — that's the one with something worth tapping to reveal.
function InfoTile({
  tone,
  label,
  lines,
  placeholder,
  onPress,
  full,
  styles,
}: {
  tone: string;
  label: string;
  lines: InfoLine[];
  placeholder: string;
  onPress?: () => void;
  // Landlord/Wifi sit side by side (flex:1 each, inside their own row's own
  // marginBottom); Address stands alone full width, so it carries its own
  // marginBottom instead.
  full?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const fg = onColor(tone);
  return (
    <Pressable
      style={[styles.mosaicTile, full ? styles.mosaicTileFull : styles.mosaicTileHalf, { backgroundColor: tone }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.mosaicPill, { backgroundColor: withAlpha(fg, 0.16) }]}>
        <Text style={[styles.mosaicPillText, { color: fg }]}>{label}</Text>
      </View>
      {lines.length === 0 ? (
        <Text style={[styles.mosaicValue, { color: fg }]}>{placeholder}</Text>
      ) : (
        <View style={styles.mosaicLines}>
          {lines.map((line, i) => (
            <View key={i} style={styles.mosaicLineRow}>
              <Ionicons name={line.icon} size={13} color={withAlpha(fg, 0.75)} />
              <Text style={[styles.mosaicLineText, { color: fg }]}>{line.text}</Text>
            </View>
          ))}
        </View>
      )}
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
  const profilePhoto = useProfilePhoto();
  const { start: startTour, step: tourStep, registerTarget: registerTourTarget } = useTour();
  const [termsVisible, setTermsVisible] = useState(false);
  // Guards the delete button against a second tap while the request is in
  // flight — the first one takes the account with it.
  const [deleting, setDeleting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  // Each tile's own y-offset within the ScrollView, captured by its onLayout
  // — Homies' own invite shortcut on the lime box uses its; the walkthrough
  // (below) uses all three to scroll each tile into view in turn.
  const homeInfoYRef = useRef(0);
  const homiesYRef = useRef(0);
  const meYRef = useRef(0);
  // The tile boxes themselves, measured once scrolled into place so the
  // walkthrough's ring can line up against wherever they actually landed.
  const homeInfoBoxRef = useRef<View>(null);
  const homiesBoxRef = useRef<View>(null);
  const meBoxRef = useRef<View>(null);

  const [displayNameInput, setDisplayNameInput] = useState(currentUser?.displayName ?? "");
  const [flatName, setFlatName] = useState(userFlat?.name ?? "");
  const [inviteEmail, setInviteEmail] = useState("");
  // One open section at a time across the whole page — the two MenuHeader
  // accordions and the two tile boxes alike — so expanding any one of them
  // closes whichever other section was open.
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  // Configuration (the tile stack) and Appearance both start collapsed —
  // separate from openSection since they wrap whole groups of tiles rather
  // than being one themselves.
  const [configOpen, setConfigOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  // Home Info's five boxes — each edited and saved independently, so their
  // drafts live apart from the flat record they're pulled from on focus.
  const [address, setAddress] = useState(userFlat?.address ?? "");
  const [wifiName, setWifiName] = useState(userFlat?.wifiName ?? "");
  const [wifiPassword, setWifiPassword] = useState(userFlat?.wifiPassword ?? "");
  const [landlordName, setLandlordName] = useState(userFlat?.landlordName ?? "");
  const [landlordPhone, setLandlordPhone] = useState(userFlat?.landlordPhone ?? "");
  const [landlordEmail, setLandlordEmail] = useState(userFlat?.landlordEmail ?? "");
  const [importantInfo, setImportantInfo] = useState(userFlat?.importantInfo ?? "");
  // The mosaic's Wifi tile masks the password by default — tapping the tile
  // flips this to show it, tapping again hides it back.
  const [wifiRevealed, setWifiRevealed] = useState(false);
  const [showColorWheel, setShowColorWheel] = useState(false);
  // Flips the flat code to "Copied" for a moment after it's tapped.
  const [copied, setCopied] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  // The screen pads 16 a side and the menu body another 2 — the rest is the
  // wheel's, capped so it doesn't balloon on tablets.
  const wheelSize = Math.min(windowWidth - 36, 320);

  useFocusEffect(
    useCallback(() => {
      setFlatName(userFlat?.name ?? "");
      setDisplayNameInput(currentUser?.displayName ?? "");
      setAddress(userFlat?.address ?? "");
      setWifiName(userFlat?.wifiName ?? "");
      setWifiPassword(userFlat?.wifiPassword ?? "");
      setLandlordName(userFlat?.landlordName ?? "");
      setLandlordPhone(userFlat?.landlordPhone ?? "");
      setLandlordEmail(userFlat?.landlordEmail ?? "");
      setImportantInfo(userFlat?.importantInfo ?? "");
    }, [
      userFlat?.name,
      currentUser?.displayName,
      userFlat?.address,
      userFlat?.wifiName,
      userFlat?.wifiPassword,
      userFlat?.landlordName,
      userFlat?.landlordPhone,
      userFlat?.landlordEmail,
      userFlat?.importantInfo,
    ]),
  );

  // Drives the walkthrough's last three stops. Each one names a tile on
  // this page — all three (Home Info, Homies, Me) live inside the same
  // collapsed Configuration group, so that opens, but the tile itself is
  // deliberately left collapsed rather than expanded: fully open, Home Info
  // in particular runs taller than the screen, which pushed the tour's ring
  // (and the bubble positioned off it) above the top of the viewport. A
  // collapsed tile is just its header row — short, and guaranteed to fit
  // once scrolled into view. Measured after the scroll has had a moment to
  // settle, so the ring lines up with the real tile rather than the
  // pre-scroll layout.
  useEffect(() => {
    const targetKey = tourStep?.target;
    const entry =
      targetKey === "settings-homeInfo"
        ? { yRef: homeInfoYRef, boxRef: homeInfoBoxRef }
        : targetKey === "settings-homies"
          ? { yRef: homiesYRef, boxRef: homiesBoxRef }
          : targetKey === "settings-me"
            ? { yRef: meYRef, boxRef: meBoxRef }
            : null;
    if (!entry || !targetKey) return;

    setConfigOpen(true);
    // Collapsed, not expanded — see above.
    setOpenSection(null);

    let measureTimer: ReturnType<typeof setTimeout>;
    const expandTimer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(entry.yRef.current - 12, 0), animated: true });
      measureTimer = setTimeout(() => {
        entry.boxRef.current?.measureInWindow((x, y, width, height) => {
          registerTourTarget(targetKey, { x, y, width, height });
        });
      }, 380);
    }, 60);
    return () => {
      clearTimeout(expandTimer);
      clearTimeout(measureTimer);
    };
  }, [tourStep, registerTourTarget]);

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

  const toggleSection = (key: SectionKey) => setOpenSection((prev) => (prev === key ? null : key));

  const saveFlatName = async () => {
    if (!flatName.trim() || flatName === userFlat.name) return;
    await flatService.updateFlatName(userFlat.id, flatName.trim());
    await refreshFlat();
  };

  // Shared by every Home Info box — each one saves only its own field(s), so
  // tapping "Save" on the address doesn't also flush a half-typed wifi
  // password sitting in another box.
  const saveHomeInfo = async (fields: HomeInfoFields) => {
    await flatService.updateFlatHomeInfo(userFlat.id, fields);
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

  // Tapping the flat code copies it to the clipboard and swaps the label to
  // "Copied" for a moment before it settles back to the code.
  const copyCode = async () => {
    await Clipboard.setStringAsync(userFlat.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // The invite shortcut on the lime box: opens Configuration (if it wasn't
  // already) and the Homies tile specifically, then scrolls Homies up near
  // the top of the screen once it's actually rendered — a beat after the
  // state change, so its onLayout has had a chance to report where it
  // landed once the rest of the tile stack mounted above it.
  // The tab flow underneath stays mounted while Settings is on top of it
  // (a native-stack push, not a swap), so the tab bar/settings-avatar
  // measurements the walkthrough needs are already sitting in TourContext —
  // going back and starting can happen back to back, no re-measure wait.
  const replayTour = () => {
    navigation.goBack();
    setTimeout(startTour, 300);
  };

  const openHomiesInvite = () => {
    setConfigOpen(true);
    setOpenSection("homies");
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(homiesYRef.current - 12, 0), animated: true });
    }, 150);
  };

  // The mosaic's three preview tiles, each built from whichever of its
  // fields actually have something in them — an empty field just doesn't
  // get a line, rather than showing up blank.
  const infoLine = (icon: InfoLine["icon"], text: string): InfoLine | null => (text.trim() ? { icon, text: text.trim() } : null);
  const isLine = (line: InfoLine | null): line is InfoLine => line !== null;

  const landlordLines: InfoLine[] = [
    infoLine("person-outline", landlordName),
    infoLine("call-outline", landlordPhone),
    infoLine("mail-outline", landlordEmail),
  ].filter(isLine);

  // Password masked to dots until the tile's tapped — a fixed dot count
  // rather than one that matches the real length, so it can't be counted.
  const wifiLines: InfoLine[] = [
    infoLine("wifi-outline", wifiName),
    infoLine("key-outline", wifiPassword.trim() ? (wifiRevealed ? wifiPassword : "••••••••") : ""),
  ].filter(isLine);

  const addressLines: InfoLine[] = [infoLine("location-outline", address)].filter(isLine);

  return (
    <>
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { paddingTop: insets.top + 10 }]}
      onScroll={(e) => {
        scrollYRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      // Otherwise a tap on the address dropdown while the Wifi/Address
      // field is still focused gets eaten as a keyboard-dismiss by the
      // ScrollView before the suggestion's own onPress ever fires.
      keyboardShouldPersistTaps="handled"
    >
      <Pressable style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={10}>
        <Ionicons name="chevron-back" size={16} color={colors.textMuted} />
        <Text style={styles.backButtonText}>Back</Text>
      </Pressable>
      <Text style={styles.pageTitle}>Home Hub</Text>

      {/* ── Flat identity: the same lime tile the Home tab builds its mosaic
          from — flat name as the headline, join code as a tap-to-copy line
          underneath, and an invite shortcut pinned to the right, vertically
          centred on the text column beside it. The address now lives in
          the Address tile below instead of duplicating it up here. Name
          and code stay read-only here; the name is actually changed from
          the Home Info tile below. ── */}
      <Pressable style={styles.hubLimeBox} onPress={copyCode}>
        <View style={styles.hubLimeRow}>
          <View style={styles.flex1}>
            <Text style={styles.hubLimeTitle} numberOfLines={1}>
              {userFlat.name}
            </Text>
            <Text style={styles.hubLimeCodeLabel}>Join code</Text>
            <Text style={styles.hubLimeCode} numberOfLines={1}>
              {copied ? "Copied!" : userFlat.code}
            </Text>
          </View>
          {/* Its own Pressable, nested inside the box's — the tap lands on
              this one first, so it opens Homies instead of also copying
              the code underneath it. */}
          <Pressable style={styles.hubLimeInviteButton} onPress={openHomiesInvite} hitSlop={8}>
            <Ionicons name="person-add" size={18} color={LIME_FG} />
          </Pressable>
        </View>
      </Pressable>

      {/* ── Quick-glance mosaic: Landlord and Wifi side by side on top —
          each sized to fit whatever's actually filled in rather than a
          fixed height — with Address stretched full width underneath so
          the whole thing fits without truncating. ── */}
      <View style={styles.mosaicTopRow}>
        <InfoTile
          tone={CAL_PLATE}
          label="Landlord"
          lines={landlordLines}
          placeholder="No landlord info yet"
          styles={styles}
        />
        <InfoTile
          tone={CARD_TONES.indigo}
          label="Wifi"
          lines={wifiLines}
          placeholder="No wifi info yet"
          onPress={() => setWifiRevealed((prev) => !prev)}
          styles={styles}
        />
      </View>
      <InfoTile
        tone={CARD_TONES.lilac}
        label="Address"
        lines={addressLines}
        placeholder="No address yet"
        full
        styles={styles}
      />

      {/* ── Important info: the one deliberately different tile — bigger,
          and the mosaic's only departure from the four-tone system, so
          whatever's pinned here still reads as a stuck-on note. ── */}
      <View style={styles.importantInfoBox}>
        <View style={[styles.mosaicPill, { backgroundColor: withAlpha(YELLOW_FG, 0.14) }]}>
          <Text style={[styles.mosaicPillText, { color: YELLOW_FG }]}>Important info</Text>
        </View>
        <Text style={styles.importantInfoText}>
          {importantInfo.trim() ? importantInfo.trim() : "Nothing important noted yet"}
        </Text>
      </View>

      {/* ── Configuration: same tile stack as before, now collapsed by
          default behind its own header — the label doubles as the
          expand/collapse control instead of just marking a page break. ── */}
      <Pressable style={styles.sectionHeaderRow} onPress={() => setConfigOpen((prev) => !prev)}>
        <Text style={styles.appearanceSectionLabel}>Configuration</Text>
        <View style={styles.sectionDivider} />
        <Ionicons
          name={configOpen ? "chevron-up" : "chevron-down"}
          size={14}
          color={colors.textMuted}
          style={styles.sectionHeaderIcon}
        />
      </Pressable>

      {configOpen && (
        <>

      {/* ── Home Info: flat name, plus the stuff every flatmate needs to look
          up sooner or later — address, wifi, landlord, and whatever else
          won't fit anywhere else. One continuous purple tile, same tone as
          the mosaic above: a header with its own "+" toggle, and — when
          expanded — the editable fields sitting inside that same tile
          rather than as separate cards below it. ── */}
      <View
        ref={homeInfoBoxRef}
        style={styles.hubPurpleBox}
        onLayout={(e) => {
          homeInfoYRef.current = e.nativeEvent.layout.y;
        }}
      >
        <Pressable
          style={styles.hubPurpleHeader}
          onPress={() => toggleSection("homeInfo")}
        >
          <Text style={styles.hubPurpleTitle}>Home Info</Text>
          <View style={styles.hubPurpleToggle}>
            <Ionicons name={openSection === "homeInfo" ? "remove" : "add"} size={18} color={LILAC_FG} />
          </View>
        </Pressable>

        {openSection === "homeInfo" && (
          <View style={styles.hubPurpleContent}>
            <Text style={styles.hubPurpleFieldLabel}>Flat name</Text>
            <TextInput
              style={styles.hubPurpleInput}
              value={flatName}
              onChangeText={setFlatName}
              placeholder="e.g. 12 Main St"
              placeholderTextColor={withAlpha(LILAC_FG, 0.45)}
            />
            <SaveButton style={styles.hubPurpleSaveButton} textStyle={styles.hubPurpleSaveButtonText} onPress={saveFlatName} />

            <Text style={styles.hubPurpleFieldLabel}>Address</Text>
            <AddressAutocompleteInput
              style={styles.hubPurpleInput}
              value={address}
              onChangeText={setAddress}
              placeholder="e.g. 12 Main St"
              placeholderTextColor={withAlpha(LILAC_FG, 0.45)}
            />
            <SaveButton
              style={styles.hubPurpleSaveButton}
              textStyle={styles.hubPurpleSaveButtonText}
              onPress={() => saveHomeInfo({ address })}
            />

            <Text style={styles.hubPurpleFieldLabel}>Wifi name</Text>
            <TextInput
              style={styles.hubPurpleInput}
              value={wifiName}
              onChangeText={setWifiName}
              placeholder="Network name"
              placeholderTextColor={withAlpha(LILAC_FG, 0.45)}
            />
            <Text style={styles.hubPurpleFieldLabel}>Wifi password</Text>
            <TextInput
              style={styles.hubPurpleInput}
              value={wifiPassword}
              onChangeText={setWifiPassword}
              placeholder="Password"
              placeholderTextColor={withAlpha(LILAC_FG, 0.45)}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <SaveButton
              style={styles.hubPurpleSaveButton}
              textStyle={styles.hubPurpleSaveButtonText}
              onPress={() => saveHomeInfo({ wifiName, wifiPassword })}
            />

            <Text style={styles.hubPurpleFieldLabel}>Landlord name</Text>
            <TextInput
              style={styles.hubPurpleInput}
              value={landlordName}
              onChangeText={setLandlordName}
              placeholder="Name"
              placeholderTextColor={withAlpha(LILAC_FG, 0.45)}
            />
            <Text style={styles.hubPurpleFieldLabel}>Landlord phone</Text>
            <TextInput
              style={styles.hubPurpleInput}
              value={landlordPhone}
              onChangeText={setLandlordPhone}
              placeholder="Phone number"
              placeholderTextColor={withAlpha(LILAC_FG, 0.45)}
              keyboardType="phone-pad"
            />
            <Text style={styles.hubPurpleFieldLabel}>Landlord email</Text>
            <TextInput
              style={styles.hubPurpleInput}
              value={landlordEmail}
              onChangeText={setLandlordEmail}
              placeholder="Email address"
              placeholderTextColor={withAlpha(LILAC_FG, 0.45)}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <SaveButton
              style={styles.hubPurpleSaveButton}
              textStyle={styles.hubPurpleSaveButtonText}
              onPress={() => saveHomeInfo({ landlordName, landlordPhone, landlordEmail })}
            />

            {/* The one field that's meant to stand out — anything urgent a
                flatmate shouldn't be able to scroll past unnoticed. */}
            <Text style={styles.hubPurpleFieldLabel}>Important info</Text>
            <TextInput
              style={[styles.hubPurpleInput, styles.hubPurpleInputMultiline]}
              value={importantInfo}
              onChangeText={setImportantInfo}
              placeholder="Bin day is Tuesday. Don't touch Dave's oat milk. Etc."
              placeholderTextColor={withAlpha(LILAC_FG, 0.45)}
              multiline
            />
            <SaveButton
              style={styles.hubPurpleSaveButton}
              textStyle={styles.hubPurpleSaveButtonText}
              onPress={() => saveHomeInfo({ importantInfo })}
            />
          </View>
        )}
      </View>

      {/* ── Homies: same tile-with-a-"+" treatment as Home Info, in indigo
          instead of lilac — the flatmate roster, the flat code again, and
          the invite box, all inside the one expanding tile. onLayout feeds
          the lime box's invite shortcut the y-offset to scroll to. ── */}
      <View
        ref={homiesBoxRef}
        style={styles.hubIndigoBox}
        onLayout={(e) => {
          homiesYRef.current = e.nativeEvent.layout.y;
        }}
      >
        <Pressable style={styles.hubIndigoHeader} onPress={() => toggleSection("homies")}>
          <Text style={styles.hubIndigoTitle}>Homies</Text>
          <View style={styles.hubIndigoToggle}>
            <Ionicons name={openSection === "homies" ? "remove" : "add"} size={18} color={INDIGO_FG} />
          </View>
        </Pressable>

        {openSection === "homies" && (
          <View style={styles.hubIndigoContent}>
            {/* One white backdrop for the whole roster — the member cards
                keep their own configured colours, they just sit inside a
                plain box rather than directly on the indigo tile. */}
            <View style={styles.hubIndigoRosterBox}>
              {userFlat.members.map((m) => (
                <View key={m.userId} style={[styles.memberCard, { backgroundColor: m.color ?? colors.accent }]}>
                  {/* No `color` — the card is already in the member's colour,
                      so the avatar would vanish into it. It falls back to a
                      dark wash on the card instead. */}
                  <ProfileAvatar displayName={m.displayName} color={null} photo={m.photo} size={32} fallbackOn="#000000" />
                  <Text style={styles.memberName}>{m.displayName}</Text>
                </View>
              ))}
            </View>

            <Pressable style={styles.hubIndigoCodeRow} onPress={copyCode}>
              <Text style={styles.hubIndigoCodeLabel}>Flat Code</Text>
              <Text style={styles.hubIndigoCode}>{copied ? "Copied" : userFlat.code}</Text>
            </Pressable>

            <Text style={styles.hubIndigoFieldLabel}>Invite flatmates</Text>
            <View style={styles.row}>
              <View style={[styles.hubIndigoInput, styles.flex1]}>
                <TextInput
                  style={styles.hubIndigoInputText}
                  placeholder="flatmate@email.com"
                  placeholderTextColor={withAlpha(INDIGO_FG, 0.45)}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                />
              </View>
              <Pressable style={styles.hubIndigoSaveButton} onPress={sendInvite}>
                <Text style={styles.hubIndigoSaveButtonText}>Send</Text>
              </Pressable>
            </View>
            {userFlat.invitedEmails.length > 0 && (
              <>
                <Text style={styles.hubIndigoFieldLabel}>Pending invites</Text>
                {userFlat.invitedEmails.map((email) => (
                  <Text key={email} style={styles.hubIndigoInvitedRow}>
                    {email}
                  </Text>
                ))}
              </>
            )}
          </View>
        )}
      </View>

      {/* ── Me: same tile-with-a-"+" treatment as Home Info and Homies, in
          dusty rose — profile picture, name, email and accent colour all
          inside the one expanding tile. ── */}
      <View
        ref={meBoxRef}
        style={styles.hubRoseBox}
        onLayout={(e) => {
          meYRef.current = e.nativeEvent.layout.y;
        }}
      >
        <Pressable style={styles.hubRoseHeader} onPress={() => toggleSection("me")}>
          <View style={styles.hubRoseHeaderLeft}>
            {/* Nested inside the header's own Pressable on purpose: the circle
                is its own button (add/change photo) and swallows the tap,
                while the rest of the row still opens the section. */}
            <ProfileAvatar
              displayName={currentUser.displayName}
              color={myColor}
              photo={profilePhoto.photo}
              // Matches the "+"/"−" toggle's own 30px so the header row's
              // height comes out the same as Home Info's and Homies' —
              // whose headers are just a text line beside that same toggle.
              size={30}
              editable
              busy={profilePhoto.saving}
              onPress={profilePhoto.edit}
            />
            <Text style={styles.hubRoseTitle}>Me</Text>
          </View>
          <View style={styles.hubRoseToggle}>
            <Ionicons name={openSection === "me" ? "remove" : "add"} size={18} color={LIME_FG} />
          </View>
        </Pressable>

        {openSection === "me" && (
          <View style={styles.hubRoseContent}>
            <Text style={styles.hubRoseFieldLabel}>Name</Text>
            <TextInput
              style={styles.hubRoseInput}
              value={displayNameInput}
              onChangeText={setDisplayNameInput}
              placeholderTextColor={withAlpha(LIME_FG, 0.45)}
            />
            <SaveButton style={styles.hubRoseSaveButton} textStyle={styles.hubRoseSaveButtonText} onPress={saveDisplayName} />

            {/* Same action as tapping the avatar up in the header — spelled
                out as its own row here for anyone who didn't spot that the
                circle itself is a button. */}
            <Pressable
              style={styles.hubRoseOptionRow}
              onPress={profilePhoto.edit}
              disabled={profilePhoto.saving}
            >
              <Text style={styles.hubRoseOptionText}>
                {profilePhoto.saving ? "Saving…" : "Choose profile picture"}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={withAlpha(LIME_FG, 0.6)} />
            </Pressable>

            <Text style={styles.hubRoseFieldLabel}>Email</Text>
            <Text style={styles.hubRoseEmail}>{currentUser.email}</Text>

            <Text style={styles.hubRoseFieldLabel}>Colour</Text>
            {/* Same white backdrop as the Homies roster — the swatches keep
                their own colours, they just sit inside a plain box rather
                than directly on the rose tile. */}
            <View style={styles.hubRoseColorBox}>
              <View style={styles.colorRow}>
                {MEMBER_PRESETS.map((color) => (
                  <Pressable
                    key={color}
                    style={[styles.colorSwatch, { backgroundColor: color }, isMyColor(color) && styles.colorSwatchActive]}
                    onPress={() => pickColor(color)}
                  />
                ))}
                {/* A colour picked off the wheel isn't in the row above, so
                    show it on the end — otherwise the current choice vanishes
                    once the wheel is collapsed. */}
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
            </View>
          </View>
        )}
      </View>

      {/* ── Settings: everything left over from the rest of the tab — same
          tile-with-a-"+" treatment as Home Info/Homies/Me, in navy. Sits
          between Me and Appearance rather than trailing the whole page. ── */}
      <View style={styles.hubNavyBox}>
        <Pressable style={styles.hubNavyHeader} onPress={() => toggleSection("settings")}>
          <Text style={styles.hubNavyTitle}>Settings</Text>
          <View style={styles.hubNavyToggle}>
            <Ionicons name={openSection === "settings" ? "remove" : "add"} size={18} color={PLATE_FG} />
          </View>
        </Pressable>

        {openSection === "settings" && (
          <View style={styles.hubNavyContent}>
            {/* Chore notifications are sent by the server to the whole flat
                now, so there is no in-app preference left to flip — the real
                switch is the OS permission, which is where this goes. */}
            <Pressable style={styles.hubNavyRow} onPress={openNotificationSettings}>
              <Text style={styles.hubNavyRowLabel}>Notifications</Text>
              <Ionicons name="open-outline" size={16} color={withAlpha(PLATE_FG, 0.7)} />
            </Pressable>

            {/* The terms have to stay reachable after sign-up, not just at
                the moment of acceptance — read-only here, so there's no
                second gate. */}
            <Pressable style={styles.hubNavyRow} onPress={() => setTermsVisible(true)}>
              <Text style={styles.hubNavyRowLabel}>Terms & Conditions</Text>
              <Ionicons name="chevron-forward" size={16} color={withAlpha(PLATE_FG, 0.7)} />
            </Pressable>

            <Pressable style={styles.hubNavyRow} onPress={openPrivacyPolicy}>
              <Text style={styles.hubNavyRowLabel}>Privacy Policy</Text>
              <Ionicons name="open-outline" size={16} color={withAlpha(PLATE_FG, 0.7)} />
            </Pressable>

            <Pressable style={styles.hubNavyRow} onPress={replayTour}>
              <Text style={styles.hubNavyRowLabel}>Replay walkthrough</Text>
              <Ionicons name="play-outline" size={16} color={withAlpha(PLATE_FG, 0.7)} />
            </Pressable>

            <Pressable style={styles.hubNavyDangerButton} onPress={confirmLeaveFlat}>
              <Text style={styles.hubNavyDangerButtonText}>Leave flat</Text>
            </Pressable>

            <Pressable style={styles.hubNavySignOutButton} onPress={() => logout()}>
              <Text style={styles.hubNavySignOutText}>Sign out</Text>
            </Pressable>

            {/* Last thing on the page, and the only filled-red control in
                the app — it has to be findable (App Store guideline
                5.1.1(v) requires it to be) without sitting anywhere near the
                buttons people use daily. */}
            <Pressable
              style={[styles.deleteButton, deleting && styles.deleteButtonBusy]}
              onPress={confirmDeleteAccount}
              disabled={deleting}
            >
              <Text style={styles.deleteButtonText}>{deleting ? "Deleting…" : "Delete account"}</Text>
            </Pressable>
          </View>
        )}
      </View>
        </>
      )}

      {/* ── Appearance: same subtle section label the Home tab uses ahead of
          its own mosaic ("This flat") — small, muted, straight on the page
          background, no box around the word itself. Collapsed by default,
          same as Configuration above. Then the same lilac as Home Info for
          the light button, with dark just that flipped — lilac's own ink
          as the fill, lilac itself as the ink on top. ── */}
      <Pressable style={styles.sectionHeaderRow} onPress={() => setAppearanceOpen((prev) => !prev)}>
        <Text style={styles.appearanceSectionLabel}>Appearance</Text>
        <View style={styles.sectionDivider} />
        <Ionicons
          name={appearanceOpen ? "chevron-up" : "chevron-down"}
          size={14}
          color={colors.textMuted}
          style={styles.sectionHeaderIcon}
        />
      </Pressable>

      {appearanceOpen && (
        <View style={styles.hubBlueSchemeSelector}>
          {(["dark", "light"] as const).map((option) => {
            const active = scheme === option;
            const inverted = option === "dark";
            const bg = inverted ? LILAC_FG : CARD_TONES.lilac;
            const fg = inverted ? CARD_TONES.lilac : LILAC_FG;
            return (
              <Pressable
                key={option}
                style={[
                  styles.hubBlueSchemeBtn,
                  { backgroundColor: bg },
                  active && [styles.hubBlueSchemeBtnActive, { borderColor: fg }],
                ]}
                onPress={() => setScheme(option)}
              >
                <Ionicons name={option === "dark" ? "moon" : "sunny"} size={16} color={fg} />
                <Text style={[styles.hubBlueSchemeBtnText, { color: fg }]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <TermsModal
        visible={termsVisible}
        readOnly
        onAccept={() => setTermsVisible(false)}
        onClose={() => setTermsVisible(false)}
      />
    </ScrollView>
    <TourOverlay />
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.bg },
  backButton: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start", marginBottom: 6 },
  backButtonText: { fontFamily: fonts.bold, fontSize: typeScale.caption, textTransform: "uppercase", letterSpacing: 1, color: colors.textMuted },
  pageTitle: {
    fontFamily: fonts.regular,
    fontSize: typeScale.subheading,
    letterSpacing: 3,
    color: colors.textMuted,
    marginBottom: 10,
  },
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
  deleteButton: {
    backgroundColor: colors.danger,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginTop: 12,
  },
  deleteButtonBusy: { opacity: 0.6 },
  deleteButtonText: { fontFamily: fonts.bold, color: "#ffffff", fontSize: typeScale.body },

  // The same lime tile the Home tab's mosaic is built from — flat name,
  // address, and a tap-to-copy join code, stacked the way the bento cards
  // stack a headline over a caption.
  hubLimeBox: {
    backgroundColor: CARD_TONES.lime,
    borderRadius: 24,
    padding: 14,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  hubLimeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hubLimeInviteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(LIME_FG, 0.16),
  },
  hubLimeTitle: { fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.6, color: LIME_FG },
  hubLimeCodeLabel: {
    fontFamily: fonts.bold,
    fontSize: typeScale.caption,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: withAlpha(LIME_FG, 0.65),
    marginTop: 14,
  },
  hubLimeCode: { fontFamily: fonts.bold, fontSize: typeScale.subheading, letterSpacing: 3, color: LIME_FG, marginTop: 2 },

  // The Home Info section's own header tile — same shape and shadow as the
  // lime box above, in the mosaic's lilac, so the two read as one family
  // rather than a card followed by a plain text label.
  // One continuous tile: the header is always visible, the field stack
  // beneath it only renders (and only then takes up room in the tile) once
  // expanded — no separate cards sitting outside the purple fill.
  hubPurpleBox: {
    backgroundColor: CARD_TONES.lilac,
    borderRadius: 24,
    padding: 14,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  hubPurpleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hubPurpleTitle: { fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.4, color: LILAC_FG },
  // The tile's own "+"/"−", expanding it down into the editable fields —
  // filled recess the same way the bento cards' own arrow badge is.
  hubPurpleToggle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(LILAC_FG, 0.16),
  },
  hubPurpleContent: { marginTop: 12, gap: 4 },
  hubPurpleFieldLabel: {
    fontFamily: fonts.bold,
    fontSize: typeScale.caption,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: withAlpha(LILAC_FG, 0.7),
    marginTop: 10,
    marginBottom: 2,
  },
  // Fields sit directly on the lilac fill — translucent white rather than a
  // bordered card, so they read as part of the one tile instead of another
  // surface stacked on top of it.
  hubPurpleInput: {
    fontFamily: fonts.regular,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: typeScale.body,
    color: LILAC_FG,
  },
  hubPurpleInputMultiline: { minHeight: 80, textAlignVertical: "top" },
  hubPurpleSaveButton: {
    alignSelf: "flex-end",
    backgroundColor: LILAC_FG,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  hubPurpleSaveButtonText: {
    fontFamily: fonts.bold,
    color: CARD_TONES.lilac,
    fontSize: typeScale.caption,
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  // Homies — the same tile-plus-"+" shape as Home Info above, in indigo
  // instead of lilac: the flatmate roster, the flat code, and the invite
  // box, all inside the one expanding tile.
  hubIndigoBox: {
    backgroundColor: CARD_TONES.indigo,
    borderRadius: 24,
    padding: 14,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  hubIndigoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hubIndigoTitle: { fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.4, color: INDIGO_FG },
  hubIndigoToggle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(INDIGO_FG, 0.16),
  },
  hubIndigoContent: { marginTop: 12, gap: 6 },
  hubIndigoFieldLabel: {
    fontFamily: fonts.bold,
    fontSize: typeScale.caption,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: withAlpha(INDIGO_FG, 0.7),
    marginTop: 10,
    marginBottom: 2,
  },
  hubIndigoCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: withAlpha(INDIGO_FG, 0.12),
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  hubIndigoCodeLabel: { fontFamily: fonts.bold, fontSize: typeScale.caption, letterSpacing: 2, textTransform: "uppercase", color: withAlpha(INDIGO_FG, 0.7) },
  hubIndigoCode: { fontFamily: fonts.bold, fontSize: typeScale.body, letterSpacing: 5, color: INDIGO_FG },
  hubIndigoInput: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  hubIndigoInputText: { fontFamily: fonts.bold, color: INDIGO_FG, fontSize: typeScale.body, paddingVertical: 8 },
  hubIndigoSaveButton: { backgroundColor: INDIGO_FG, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
  hubIndigoSaveButtonText: {
    fontFamily: fonts.bold,
    color: CARD_TONES.indigo,
    fontSize: typeScale.caption,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  hubIndigoInvitedRow: { fontFamily: fonts.bold, fontSize: typeScale.body, paddingVertical: 3, color: withAlpha(INDIGO_FG, 0.75) },

  // Me — the third tile in the same family. Back to lime rather than a new
  // hue: the page only draws from the Home tab's own four tones, so this
  // tile shares its colour with the flat-identity box up top.
  hubRoseBox: {
    backgroundColor: CARD_TONES.lime,
    borderRadius: 24,
    padding: 14,
    // Matches appearanceSectionLabel's own marginBottom, so the "Appearance"
    // label directly below sits evenly between this tile and the light/dark
    // buttons rather than closer to one side than the other.
    marginBottom: 6,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  hubRoseHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hubRoseHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  hubRoseTitle: { fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.4, color: LIME_FG },
  hubRoseToggle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(LIME_FG, 0.16),
  },
  hubRoseContent: { marginTop: 12, gap: 4 },
  hubRoseFieldLabel: {
    fontFamily: fonts.bold,
    fontSize: typeScale.caption,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: withAlpha(LIME_FG, 0.7),
    marginTop: 10,
    marginBottom: 2,
  },
  hubRoseInput: {
    fontFamily: fonts.regular,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: typeScale.body,
    color: LIME_FG,
  },
  hubRoseSaveButton: {
    alignSelf: "flex-end",
    backgroundColor: LIME_FG,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  hubRoseSaveButtonText: {
    fontFamily: fonts.bold,
    color: CARD_TONES.lime,
    fontSize: typeScale.caption,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  hubRoseEmail: { fontFamily: fonts.regular, fontSize: typeScale.body, color: withAlpha(LIME_FG, 0.8) },
  hubRoseOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  hubRoseOptionText: { fontFamily: fonts.bold, fontSize: typeScale.body, color: LIME_FG },
  // Same white backdrop the Homies roster sits in — the swatches keep their
  // own colours, they just aren't painted directly onto the rose tile.
  hubRoseColorBox: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
  },

  // The preview mosaic — Landlord and Wifi as an equal-width pair (flexbox's
  // default row-stretch keeps them the same height as each other), Address
  // stretched full width underneath. No fixed height anywhere: every tile
  // grows to fit whatever's actually in it.
  mosaicTopRow: { flexDirection: "row", gap: MOSAIC_GAP },
  mosaicTile: {
    borderRadius: 20,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  // Landlord/Wifi (inside mosaicTopRow, whose own gap separates them from
  // each other and from Address below) vs Address standing alone full
  // width, which needs its own bottom margin instead.
  mosaicTileHalf: { flex: 1 },
  mosaicTileFull: { marginTop: MOSAIC_GAP, marginBottom: 12 },
  mosaicPill: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, marginBottom: 8 },
  mosaicPillText: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase" },
  mosaicValue: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 18 },
  mosaicLines: { gap: 6 },
  // No numberOfLines cap on the text below — the row wraps instead of
  // truncating, which is the whole point of Address getting the full width.
  mosaicLineRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  mosaicLineText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  flex1: { flex: 1 },
  // Fixed white regardless of theme or the indigo tile it sits in — a plain
  // backdrop the coloured member cards sit inside, rather than the indigo
  // fill itself.
  hubIndigoRosterBox: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 8,
    gap: 8,
  },
  memberCard: { flexDirection: "row", alignItems: "center", borderRadius: 12, padding: 12, gap: 12 },
  memberName: { fontFamily: fonts.bold, fontSize: typeScale.body, letterSpacing: 0.3, textTransform: "uppercase", color: "rgba(0,0,0,0.75)" },
  // The bigger yellow tile — the mosaic's one deliberate colour exception.
  // A touch taller than the others by default (minHeight) so it reads as
  // "the important one" even before anything's been typed into it.
  importantInfoBox: {
    backgroundColor: YELLOW,
    borderRadius: 20,
    padding: 14,
    minHeight: 96,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  importantInfoText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: YELLOW_FG },

  // Configuration and Appearance are both collapsible now, collapsed by
  // default — the whole row (hairline, label, chevron) is the toggle,
  // rather than the label being a plain page break.
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4, marginBottom: 10 },
  sectionDivider: { flex: 1, height: 1, backgroundColor: colors.border },
  sectionHeaderIcon: { marginLeft: 2 },
  appearanceSectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 0.3,
    color: colors.textMuted,
  },
  // Appearance is the last thing on the page now, so this carries the
  // larger end-of-scroll clearance the Settings tile used to.
  hubBlueSchemeSelector: { flexDirection: "row", gap: 10, marginBottom: 32 },
  // The two buttons themselves are the tiles — Home Info's lilac, same
  // shadow and corner radius as the other tiles on the page. Background and
  // ink colour are supplied per-button inline (dark is light's fill/ink
  // swapped), so this only carries the shape.
  hubBlueSchemeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 20,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  hubBlueSchemeBtnActive: { borderWidth: 2 },
  hubBlueSchemeBtnText: {
    fontFamily: fonts.bold,
    fontSize: typeScale.caption,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Settings — the last tile, in the dark plate the Home tab's own bills
  // card uses, so this stays inside the same four-tone system rather than
  // adding a fifth: everything that used to trail the page as a loose stack
  // of rows (notifications, legal, leave flat, sign out, delete account)
  // now folds into one expanding box.
  hubNavyBox: {
    backgroundColor: CAL_PLATE,
    borderRadius: 24,
    padding: 14,
    // Same as every other mid-page tile now — it sits between Me and
    // Appearance rather than trailing the page, so it no longer needs the
    // larger end-of-scroll clearance.
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  hubNavyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hubNavyTitle: { fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.4, color: PLATE_FG },
  hubNavyToggle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(PLATE_FG, 0.16),
  },
  hubNavyContent: { marginTop: 12, gap: 2 },
  hubNavyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  hubNavyRowLabel: { fontFamily: fonts.regular, fontSize: typeScale.body, color: PLATE_FG },
  // Filled, rounded pills — the same tile-button treatment every other
  // Save/Send button on the page uses — rather than a bare-bordered or
  // textonly row, so these read as buttons on the tile instead of settings
  // rows that happen to sit inside one.
  hubNavyDangerButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 14,
  },
  hubNavyDangerButtonText: { fontFamily: fonts.bold, color: colors.danger, fontSize: typeScale.body },
  hubNavySignOutButton: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  hubNavySignOutText: { fontFamily: fonts.bold, color: withAlpha(PLATE_FG, 0.8), fontSize: typeScale.body },
  });
}