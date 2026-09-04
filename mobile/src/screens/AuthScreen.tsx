import React, { useMemo, useState, useRef } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform, Image } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import { Ionicons } from "@expo/vector-icons";
import AnimatedInput from "../components/AnimatedInput";
import TermsModal from "../components/TermsModal";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ApiError } from "../services/apiClient";
import { GOOGLE_SIGNIN_CONFIGURED } from "../config/env";
import type { ThemeColors } from "../theme/colors";
import { LOGIN_ACCENT, onColor } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import brandMark from "../../assets/branding/homiesIcon.png";
import twoHouseMark from "../../assets/branding/2houseIcon.png";
import homiesTitle from "../../assets/branding/HomesTitle.png";

// The stylesheet is built per-scheme now, so downstream helpers take it as
// an argument rather than closing over a module-level one.
type Styles = ReturnType<typeof createStyles>;

// The house mark, top-left, in place of the old typed title/subtitle.
function BrandMark({ styles }: { styles: Styles }) {
  return <Image source={brandMark} style={styles.logoMark} resizeMode="contain" />;
}

// The "Homies. Keeping the peace." title, sat in the gap below the mark and
// above the form rather than beside the mark — its own block so it doesn't
// affect the mark's row or push the form down as it grows.
function TitleMark({ styles }: { styles: Styles }) {
  return <Image source={homiesTitle} style={styles.titleMark} resizeMode="contain" />;
}

// Port of AuthPage.jsx: a single login/signup toggle form, now with
// Google/Apple sign-in alongside email/password (email/password kept per the
// migration plan's decision to offer all three).
export default function AuthScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Nobody's signed in yet, so the palette is the plain scheme one — there's
  // no member colour to accent it with until after this screen.
  const inputTheme = useMemo(
    () => ({
      accentColor: LOGIN_ACCENT,
      idleBorderColor: colors.inputBorder,
      idleLabelColor: colors.textMuted,
      idleTextColor: colors.textMuted,
    }),
    [colors],
  );
  const { signup, login, loginWithGoogle, loginWithApple } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<{
    email?: boolean;
    password?: boolean;
    terms?: boolean;
  }>({});
  // Terms acceptance lives only in memory and only for this sign-up attempt —
  // the server records the durable acceptance against the account it creates.
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  // Set when an OAuth sign-in came back TERMS_REQUIRED (i.e. it would create a
  // new account). Holds the callback that re-runs that same sign-in with
  // acceptance, so the user doesn't have to tap Google/Apple a second time.
  const [pendingOAuthRetry, setPendingOAuthRetry] = useState<(() => Promise<void>) | null>(null);

  // Store the real email from Apple's first authorization to avoid "Hide My Email"
  // relay on subsequent sign-ins. Apple may provide a privacy relay address on later
  // sign-ins for the same user, which would break the flat inviting system that uses
  // email invites. We preserve the original real email so the inviting system works.
  const appleRealEmailRef = useRef<string | null>(null);

  const clearInvalid = (field: "email" | "password" | "terms") =>
    setInvalidFields((f) => (f[field] ? { ...f, [field]: false } : f));

  const switchMode = () => {
    setMode(mode === "signup" ? "login" : "signup");
    setError(null);
    setInvalidFields({});
  };

  const handleSubmit = async () => {
    setError(null);
    const missing: typeof invalidFields = {};
    if (!email.trim()) missing.email = true;
    if (!password) missing.password = true;
    // Hard gate: no account is created until the terms have been accepted.
    if (mode === "signup" && !acceptedTerms) missing.terms = true;
    if (Object.keys(missing).length > 0) {
      setInvalidFields(missing);
      if (missing.terms) setError("Please accept the Terms & Conditions to continue.");
      return;
    }
    setInvalidFields({});
    setSubmitting(true);
    try {
      if (mode === "signup") {
        await signup(email.trim(), password, acceptedTerms);
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Both OAuth handlers share this: run the sign-in, and if the server says
  // this identity would create a NEW account without terms acceptance, park
  // the retry and open the terms sheet instead of surfacing an error.
  const runOAuth = async (
    attempt: (accepted: boolean) => Promise<void>,
    failureMessage: string,
    accepted: boolean,
  ) => {
    try {
      setSubmitting(true);
      await attempt(accepted);
    } catch (err) {
      if (err instanceof ApiError && err.code === "TERMS_REQUIRED") {
        setPendingOAuthRetry(() => () => runOAuth(attempt, failureMessage, true));
        setTermsVisible(true);
        return;
      }
      setError(err instanceof ApiError ? err.message : failureMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    let idToken: string;
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response) || !response.data.idToken) {
        throw new Error("Google sign-in was cancelled or returned no token");
      }
      idToken = response.data.idToken;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Google sign-in failed");
      return;
    }
    // The token is reusable across the retry, so accepting the terms doesn't
    // send the user back through Google's sheet a second time.
    await runOAuth((accepted) => loginWithGoogle(idToken, accepted), "Google sign-in failed", acceptedTerms);
  };

  const handleAppleSignIn = async () => {
    setError(null);
    let identityToken: string;
    let appleEmail: string | null;
    let appleName: string | null;
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error("Apple sign-in returned no identity token");
      identityToken = credential.identityToken;
      
      // On first authorization, Apple provides the real email. On subsequent
      // sign-ins for the same user, Apple may provide a "Hide My Email" relay.
      // Preserve the real email from the first auth attempt so the flat inviting
      // system (which uses email invites) continues to work.
      if (credential.email && !appleRealEmailRef.current) {
        appleRealEmailRef.current = credential.email;
      }
      appleEmail = appleRealEmailRef.current ?? credential.email ?? null;
      
      appleName =
        [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ") || null;
    } catch (err: any) {
      if (err?.code === "ERR_REQUEST_CANCELED") return;
      setError(err instanceof ApiError ? err.message : "Apple sign-in failed");
      return;
    }
    await runOAuth(
      (accepted) => loginWithApple(identityToken, appleEmail, appleName, accepted),
      "Apple sign-in failed",
      acceptedTerms,
    );
  };

  // Single accept path for both entry points: the checkbox on the sign-up form
  // and the sheet an OAuth signup triggers.
  const handleAcceptTerms = () => {
    setAcceptedTerms(true);
    clearInvalid("terms");
    setError(null);
    setTermsVisible(false);
    const retry = pendingOAuthRetry;
    setPendingOAuthRetry(null);
    retry?.();
  };

  const handleCloseTerms = () => {
    setTermsVisible(false);
    setPendingOAuthRetry(null);
  };

  return (
    <View style={styles.container}>
      <BrandMark styles={styles} />
      <TitleMark styles={styles} />

      <View style={styles.formSection}>
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

        {mode === "signup" && (
          <View style={styles.termsRow}>
            <Pressable
              style={[
                styles.checkbox,
                acceptedTerms && styles.checkboxChecked,
                invalidFields.terms && styles.checkboxError,
              ]}
              onPress={() => {
                // Unticking is a plain toggle; ticking has to go through the
                // sheet, so "I agree" always follows having seen the terms.
                if (acceptedTerms) {
                  setAcceptedTerms(false);
                  return;
                }
                setTermsVisible(true);
              }}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptedTerms }}
              accessibilityLabel="Accept the Terms and Conditions"
            >
              {acceptedTerms && <Ionicons name="checkmark" size={14} color={onColor(LOGIN_ACCENT)} />}
            </Pressable>
            <Text style={styles.termsText}>
              I agree to the{" "}
              <Text style={styles.termsLink} onPress={() => setTermsVisible(true)}>
                Terms & Conditions
              </Text>
            </Text>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color={onColor(LOGIN_ACCENT)} />
          ) : (
            <Text style={styles.primaryButtonText}>{mode === "signup" ? "Sign up" : "Log in"}</Text>
          )}
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={switchMode} disabled={submitting}>
          <Text style={styles.secondaryButtonText}>{mode === "signup" ? "Log In" : "Sign Up"}</Text>
        </Pressable>

        <View style={styles.oauthRow}>
          {/* Hidden rather than disabled when no web client ID is configured:
              a visible button that always errors is worse than no button. */}
          {GOOGLE_SIGNIN_CONFIGURED && (
            <Pressable style={styles.circleButton} onPress={handleGoogleSignIn} disabled={submitting}>
              <Ionicons name="logo-google" size={18} color={colors.text} />
            </Pressable>
          )}

          {Platform.OS === "ios" && (
            <Pressable style={styles.circleButton} onPress={handleAppleSignIn} disabled={submitting}>
              <Ionicons name="logo-apple" size={20} color={colors.text} />
            </Pressable>
          )}
        </View>
      </View>

      <Image source={twoHouseMark} style={styles.cornerMark} resizeMode="contain" />

      <TermsModal visible={termsVisible} onAccept={handleAcceptTerms} onClose={handleCloseTerms} />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  // Fixed white rather than colors.bg — the login screen carries the brand
  // marks' own light backdrop regardless of scheme, the same way the marks
  // themselves keep their own fixed colours.
  container: { flex: 1, padding: 16, paddingTop: 72, backgroundColor: "#ffffff" },
  formSection: { flex: 1, justifyContent: "center", gap: 10, marginTop: 4, width: "100%", alignSelf: "center" },
  emailPasswordGap: { height: 28 },
  // The house mark, top-left in place of the old typed title/subtitle.
  logoMark: { width: 60, height: 60, alignSelf: "flex-start" },
  // Sits in the gap below the mark and above the form — `formSection`'s own
  // `flex: 1` + `justifyContent: center` is what keeps the login fields
  // centred in whatever room is left under this, so this can move without
  // pushing the form itself down.
  titleMark: {
    alignSelf: "center",
    marginTop: 28,
    height: 96,
    width: Math.round(96 * (348 / 146)),
  },
  // The two-house illustration, bottom-right — a second, looser brand touch
  // clear of the form above it.
  cornerMark: { position: "absolute", right: 16, bottom: 16, width: 140, height: 58 },
  error: { fontFamily: fonts.regular, color: colors.danger, textAlign: "center" },
  primaryButton: { backgroundColor: LOGIN_ACCENT, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 18},
  primaryButtonText: { fontFamily: fonts.bold, color: onColor(LOGIN_ACCENT), fontSize: typeScale.body },

  secondaryButton: {
    borderWidth: 1,
    borderColor: LOGIN_ACCENT,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
  },

  secondaryButtonText: { fontFamily: fonts.bold, color: LOGIN_ACCENT, fontSize: typeScale.body },

  termsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.inputBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: LOGIN_ACCENT, borderColor: LOGIN_ACCENT },
  checkboxError: { borderColor: colors.danger },
  termsText: { flex: 1, fontFamily: fonts.regular, fontSize: typeScale.body, color: colors.textMuted },
  termsLink: { fontFamily: fonts.bold, color: LOGIN_ACCENT, textDecorationLine: "underline" },

  oauthRow: { flexDirection: "row", justifyContent: "center", gap: 16, paddingTop: 28},
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  });
}
