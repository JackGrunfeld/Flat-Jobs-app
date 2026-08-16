import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform, Modal } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import AnimatedInput from "../components/AnimatedInput";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ApiError } from "../services/apiClient";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";

const CYCLE_WORDS = ["Co-Living", "Flatting", "Home", "Share-House", "Apartment"];
type SegmentStyle = "normal" | "bold" | "cycle";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Picker opens centered on a plausible adult birth year rather than "today",
// which is a much better starting scroll position for picking a birthdate.
const DEFAULT_BIRTHDAY = new Date(new Date().getFullYear() - 18, 0, 1);

function formatBirthdayLabel(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// Built from local date parts (not toISOString) so the picker's local-midnight
// selection doesn't shift a day when the device is behind UTC.
function toISODateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function buildSubtitleSegments(cycleWord: string): { text: string; style: SegmentStyle }[] {
  return [
    { text: "A ", style: "normal" },
    { text: "One-Stop", style: "bold" },
    { text: " Shop for All ", style: "normal" },
    { text: cycleWord, style: "cycle" },
    { text: "Needs", style: "normal" },
  ];
}

// Fixed segments used while typing out the initial sentence — the cycling
// word only starts backspacing/retyping once this first pass finishes.
const TYPING_SEGMENTS = buildSubtitleSegments(CYCLE_WORDS[0]);
const SUBTITLE_LENGTH = TYPING_SEGMENTS.reduce((sum, seg) => sum + seg.text.length, 0);
// Char index where each emphasized word starts, typing pauses there.
const SUBTITLE_PAUSE_INDEXES = (() => {
  const indexes = new Set<number>();
  let consumed = 0;
  for (const seg of TYPING_SEGMENTS) {
    if (seg.style !== "normal") indexes.add(consumed);
    consumed += seg.text.length;
  }
  return indexes;
})();

// The stylesheet is built per-scheme now, so these two take it as an argument
// rather than closing over a module-level one.
type Styles = ReturnType<typeof createStyles>;

function styleForSegment(styles: Styles, style: SegmentStyle) {
  if (style === "bold") return styles.subtitleBold;
  if (style === "cycle") return styles.subtitleCycle;
  return undefined;
}

function typedSubtitleNodes(
  styles: Styles,
  visibleChars: number,
  cycleIndex: number,
  cycleWordChars: number,
  cursor: React.ReactNode,
) {
  const typingDone = visibleChars >= SUBTITLE_LENGTH;
  const currentCycleWord = CYCLE_WORDS[cycleIndex].slice(0, cycleWordChars);
  const segments = typingDone ? buildSubtitleSegments(currentCycleWord) : TYPING_SEGMENTS;
  const nodes: React.ReactNode[] = [];
  let consumed = 0;
  segments.forEach((seg, idx) => {
    const shown = typingDone ? seg.text : seg.text.slice(0, Math.max(0, Math.min(visibleChars - consumed, seg.text.length)));
    consumed += seg.text.length;
    if (shown) {
      const style = styleForSegment(styles, seg.style);
      nodes.push(
        style ? (
          <Text key={idx} style={style}>
            {shown}
          </Text>
        ) : (
          shown
        ),
      );
    }
    // Once the sentence is fully typed, the cursor tracks the cycling word
    // (where the backspace/retype animation runs) instead of the sentence end.
    if (typingDone && seg.style === "cycle") {
      nodes.push(<React.Fragment key="cursor">{cursor}</React.Fragment>);
    }
  });
  if (!typingDone) nodes.push(<React.Fragment key="cursor">{cursor}</React.Fragment>);
  return nodes;
}

// Port of AuthPage.jsx: a single login/signup toggle form, now with
// Google/Apple sign-in alongside email/password (email/password kept per the
// migration plan's decision to offer all three).
export default function AuthScreen() {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Nobody's signed in yet, so the palette is the plain scheme one — there's
  // no member colour to accent it with until after this screen.
  const inputTheme = useMemo(
    () => ({
      accentColor: colors.accentInk,
      idleBorderColor: colors.inputBorder,
      idleLabelColor: colors.textMuted,
      idleTextColor: colors.textMuted,
    }),
    [colors],
  );
  const { signup, login, loginWithGoogle, loginWithApple } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<{
    name?: boolean;
    email?: boolean;
    password?: boolean;
    birthday?: boolean;
  }>({});
  const [visibleChars, setVisibleChars] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);
  const [cycleIndex, setCycleIndex] = useState(0);
  const [cycleWordChars, setCycleWordChars] = useState(CYCLE_WORDS[0].length);
  const [cyclePhase, setCyclePhase] = useState<"pause" | "deleting" | "typing">("pause");
  const typingDone = visibleChars >= SUBTITLE_LENGTH;

  useEffect(() => {
    if (typingDone) return;
    const delay = SUBTITLE_PAUSE_INDEXES.has(visibleChars) ? 400 : 45;
    const timer = setTimeout(() => setVisibleChars((c) => c + 1), delay);
    return () => clearTimeout(timer);
  }, [visibleChars, typingDone]);

  // Backspace-then-retype animation for the cycling word, once the initial
  // sentence has finished typing.
  useEffect(() => {
    if (!typingDone) return;

    if (cyclePhase === "pause") {
      const timer = setTimeout(() => setCyclePhase("deleting"), 1400);
      return () => clearTimeout(timer);
    }

    if (cyclePhase === "deleting") {
      if (cycleWordChars > 0) {
        const timer = setTimeout(() => setCycleWordChars((c) => c - 1), 35);
        return () => clearTimeout(timer);
      }
      setCycleIndex((i) => (i + 1) % CYCLE_WORDS.length);
      setCyclePhase("typing");
      return;
    }

    if (cyclePhase === "typing") {
      const nextWord = CYCLE_WORDS[cycleIndex];
      if (cycleWordChars < nextWord.length) {
        const timer = setTimeout(() => setCycleWordChars((c) => c + 1), 60);
        return () => clearTimeout(timer);
      }
      setCyclePhase("pause");
      return;
    }
  }, [typingDone, cyclePhase, cycleWordChars, cycleIndex]);

  useEffect(() => {
    const blink = setInterval(() => setCursorOn((v) => !v), 500);
    return () => clearInterval(blink);
  }, []);

  const clearInvalid = (field: "name" | "email" | "password" | "birthday") =>
    setInvalidFields((f) => (f[field] ? { ...f, [field]: false } : f));

  const openDatePicker = () => {
    clearInvalid("birthday");
    setShowDatePicker(true);
  };

  const onAndroidBirthdayChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShowDatePicker(false);
    if (event.type === "set" && selected) setBirthday(selected);
  };

  const handleSubmit = async () => {
    setError(null);
    const missing: typeof invalidFields = {};
    if (mode === "signup" && !name.trim()) missing.name = true;
    if (mode === "signup" && !birthday) missing.birthday = true;
    if (!email.trim()) missing.email = true;
    if (!password) missing.password = true;
    if (Object.keys(missing).length > 0) {
      setInvalidFields(missing);
      return;
    }
    setInvalidFields({});
    setSubmitting(true);
    try {
      if (mode === "signup") {
        await signup(name.trim(), email.trim(), password, toISODateString(birthday!));
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response) || !response.data.idToken) {
        throw new Error("Google sign-in was cancelled or returned no token");
      }
      setSubmitting(true);
      await loginWithGoogle(response.data.idToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Google sign-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAppleSignIn = async () => {
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error("Apple sign-in returned no identity token");
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(" ") || null;
      setSubmitting(true);
      await loginWithApple(credential.identityToken, credential.email, fullName);
    } catch (err: any) {
      if (err?.code === "ERR_REQUEST_CANCELED") return;
      setError(err instanceof ApiError ? err.message : "Apple sign-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.titleFlat}>flat</Text>
        <Text style={styles.titleR}>R</Text>
      </View>
      <Text style={styles.subtitle}>
        {typedSubtitleNodes(
          styles,
          visibleChars,
          cycleIndex,
          cycleWordChars,
          <Text style={[styles.subtitleCursor, { opacity: cursorOn ? 1 : 0 }]}>▌</Text>,
        )}
      </Text>

      <View style={styles.formSection}>
        {mode === "signup" && (
          <AnimatedInput
            {...inputTheme}
            label="Your name"
            error={invalidFields.name}
            value={name}
            onChangeText={(t) => {
              setName(t);
              clearInvalid("name");
            }}
          />
        )}
        {mode === "signup" && (
          <Pressable onPress={openDatePicker}>
            <View pointerEvents="none">
              <AnimatedInput
                {...inputTheme}
                label="Birthday"
                error={invalidFields.birthday}
                editable={false}
                value={birthday ? formatBirthdayLabel(birthday) : ""}
              />
            </View>
          </Pressable>
        )}
        <AnimatedInput
          {...inputTheme}
          label="Email"
          error={invalidFields.email}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            clearInvalid("email");
          }}
        />
        <View style={styles.emailPasswordGap} />
        <AnimatedInput
          {...inputTheme}
          label="Password"
          error={invalidFields.password}
          secureTextEntry
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            clearInvalid("password");
          }}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={styles.primaryButtonText}>{mode === "signup" ? "Sign up" : "Log in"}</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => setMode(mode === "signup" ? "login" : "signup")}
          disabled={submitting}
        >
          <Text style={styles.secondaryButtonText}>{mode === "signup" ? "Log In" : "Sign Up"}</Text>
        </Pressable>

        <View style={styles.oauthRow}>
          <Pressable style={styles.circleButton} onPress={handleGoogleSignIn} disabled={submitting}>
            <Ionicons name="logo-google" size={18} color={colors.text} />
          </Pressable>

          {Platform.OS === "ios" && (
            <Pressable style={styles.circleButton} onPress={handleAppleSignIn} disabled={submitting}>
              <Ionicons name="logo-apple" size={20} color={colors.text} />
            </Pressable>
          )}
        </View>
      </View>

      {showDatePicker && Platform.OS === "android" && (
        <DateTimePicker
          value={birthday ?? DEFAULT_BIRTHDAY}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={onAndroidBirthdayChange}
        />
      )}

      {Platform.OS === "ios" && (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <Pressable style={styles.pickerBackdrop} onPress={() => setShowDatePicker(false)}>
            <Pressable style={styles.pickerSheet} onPress={() => {}}>
              <DateTimePicker
                value={birthday ?? DEFAULT_BIRTHDAY}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                themeVariant={scheme}
                onChange={(_event, selected) => {
                  if (selected) setBirthday(selected);
                }}
              />
              <Pressable style={styles.pickerDoneButton} onPress={() => setShowDatePicker(false)}>
                <Text style={styles.pickerDoneText}>Done</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, padding: 3, paddingTop: 72, backgroundColor: colors.bg },
  titleRow: { flexDirection: "row", alignItems: "baseline", paddingLeft: 20 },
  formSection: { flex: 1, justifyContent: "center", gap: 10, marginTop: 4, width: "82%", alignSelf: "center" },
  emailPasswordGap: { height: 28 },
  titleFlat: { fontFamily: fonts.regular, fontSize: typeScale.display, color: colors.text },
  // Ink, not the fill: the R is a letter printed on the page, and in light
  // mode the fill is mixed to sit *under* text rather than to be it.
  titleR: { fontFamily: fonts.display, fontSize: typeScale.display, color: colors.accentInk, marginLeft: 2 },
  subtitle: {
    fontFamily: fonts.subtitle,
    fontSize: typeScale.subheading,
    lineHeight: 30,
    height: 60,
    letterSpacing: 3,
    color: colors.textMuted,
    marginTop: 24,
    paddingLeft: 20,
  },
  subtitleBold: { fontFamily: fonts.subtitleBold },
  subtitleCycle: { fontFamily: fonts.subtitleBold, color: colors.text },
  subtitleCursor: { fontFamily: fonts.subtitleBold, color: colors.accentInk },
  error: { fontFamily: fonts.regular, color: colors.danger, textAlign: "center" },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 8, padding: 10, alignItems: "center", marginTop: 18},
  primaryButtonText: { fontFamily: fonts.bold, color: colors.accentText, fontSize: typeScale.body },

  secondaryButton: {
    borderWidth: 2,
    borderColor: colors.accentInk,
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    marginTop: 4,
  },

  secondaryButtonText: { fontFamily: fonts.bold, color: colors.accentInk, fontSize: typeScale.body },

  oauthRow: { flexDirection: "row", justifyContent: "center", gap: 16, paddingTop: 28},
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.inputBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  // Stays a dark scrim in both schemes — it's dimming whatever is behind the
  // sheet, which is the page rather than part of it.
  pickerBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  pickerSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24 },
  pickerDoneButton: { alignItems: "center", paddingVertical: 14, marginHorizontal: 16 },
  pickerDoneText: { fontFamily: fonts.bold, color: colors.accentInk, fontSize: typeScale.body },
  });
}
