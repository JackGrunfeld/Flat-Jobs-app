import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useAuth } from "../context/AuthContext";
import * as flatService from "../services/flatService";
import { ApiError } from "../services/apiClient";
import { useTypewriterCycle } from "../hooks/useTypewriterCycle";
import { useTheme } from "../context/ThemeContext";
import { LOGIN_ACCENT, onColor } from "../theme/colors";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import AddressAutocompleteInput from "../components/AddressAutocompleteInput";

type FlowView = "choice" | "create" | "created" | "join";

const WELCOME_WORDS = [
  "Welcome!",
  "Bienvenue!",
  "Willkommen!",
  "¡Bienvenido!",
  "Benvenuto!",
  "Welkom!",
  "Bem-vindo!",
  "Witaj!",
  "Tervetuloa!",
  "Velkommen!",
];

// Port of FlatSetupPage.jsx: create-or-join-flat flow, plus an on-mount poll
// for a pending email invite (e.g. an invite sent moments before this user
// finished signing up — checkPendingInvite may not see it yet on the very
// first call, hence the one retry after a short delay).
export default function FlatSetupScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { refreshFlat, logout } = useAuth();
  const [view, setView] = useState<FlowView>("choice");
  const [flatName, setFlatName] = useState("");
  const [flatAddress, setFlatAddress] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const polledOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { flat } = await flatService.checkPendingInvite();
      if (flat || cancelled) return;
      polledOnce.current = true;
      setTimeout(async () => {
        if (cancelled) return;
        const retry = await flatService.checkPendingInvite();
        if (retry.flat) await refreshFlat();
      }, 1500);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const withBusy = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () =>
    withBusy(async () => {
      if (!flatName.trim()) throw new ApiError(400, "Enter a hommies name");
      const { flat } = await flatService.createFlat(flatName.trim(), flatAddress.trim() || undefined);
      setCreatedCode(flat.code);
      setView("created");
    });

  const handleJoin = () =>
    withBusy(async () => {
      if (!joinCode.trim()) throw new ApiError(400, "Enter a flat code");
      await flatService.joinFlatByCode(joinCode.trim());
      await refreshFlat();
    });

  return (
    <View style={styles.container}>
      {view === "choice" && (
        <>
          <Text style={styles.title}>
            Welcome to hommies!
            <Text style={[styles.titleCursor, { opacity: 1 ? 1 : 0 }]}>▌</Text>
          </Text>
          <Text style={styles.subtitle}>Create a new hommies, or join one with a code.</Text>
          <Pressable style={styles.primaryButton} onPress={() => setView("create")}>
            <Text style={styles.primaryButtonText}>Create hommies</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => setView("join")}>
            <Text style={styles.secondaryButtonText}>Join hommies</Text>
          </Pressable>
          <Pressable onPress={() => logout()}>
            <Text style={styles.logoutText}>Sign out</Text>
          </Pressable>
        </>
      )}

      {view === "create" && (
        <>
          <Text style={styles.title}>Name your hommies</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 12 Main St"
            placeholderTextColor={colors.textMuted}
            value={flatName}
            onChangeText={setFlatName}
          />
          {/* Optional — feeds Home Hub's Address box on the first day, rather
              than leaving it blank until someone fills it in from Settings. */}
          <AddressAutocompleteInput
            style={styles.input}
            placeholder="Flat address (optional)"
            placeholderTextColor={colors.textMuted}
            value={flatAddress}
            onChangeText={setFlatAddress}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.primaryButton} onPress={handleCreate} disabled={busy}>
            {busy ? <ActivityIndicator color={onColor(LOGIN_ACCENT)} /> : <Text style={styles.primaryButtonText}>Create</Text>}
          </Pressable>
          <Pressable onPress={() => setView("choice")}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </>
      )}

      {view === "created" && (
        <>
          <Text style={styles.title}>Hommies created!</Text>
          <Text style={styles.subtitle}>Share this code with your flatmates:</Text>
          <View style={styles.codeBox}>
            <Text style={styles.code}>{createdCode}</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={() => refreshFlat()}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </>
      )}

      {view === "join" && (
        <>
          <Text style={styles.title}>Enter your flat code</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            placeholder="ABC123"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            value={joinCode}
            onChangeText={setJoinCode}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.primaryButton} onPress={handleJoin} disabled={busy}>
            {busy ? <ActivityIndicator color={onColor(LOGIN_ACCENT)} /> : <Text style={styles.primaryButtonText}>Join</Text>}
          </Pressable>
          <Pressable onPress={() => setView("choice")}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 16, gap: 12, backgroundColor: colors.bg },
  // The greeting reads the same as HomeScreen's typed greeting — main text
  // colour, not the muted page-title treatment, so it feels like the app's
  // voice rather than a settings header.
  title: {
    fontFamily: fonts.regular,
    fontSize: 28,
    letterSpacing: -0.7,
    lineHeight: 31,
    textAlign: "center",
    color: colors.text,
    marginBottom: 12,
  },
  titleCursor: { color: LOGIN_ACCENT },
  subtitle: { fontFamily: fonts.regular, fontSize: typeScale.body, color: colors.textMuted, textAlign: "center", marginBottom: 12 },
  input: {
    fontFamily: fonts.regular,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: typeScale.body,
    color: colors.text,
  },
  codeInput: { fontFamily: fonts.bold, textAlign: "center", letterSpacing: 4, fontSize: typeScale.body },
  error: { fontFamily: fonts.regular, color: colors.danger, textAlign: "center" },
  primaryButton: { backgroundColor: LOGIN_ACCENT, borderRadius: 8, padding: 14, alignItems: "center" },
  primaryButtonText: { fontFamily: fonts.bold, color: onColor(LOGIN_ACCENT), fontSize: typeScale.body },
  secondaryButton: { borderWidth: 1, borderColor: LOGIN_ACCENT, borderRadius: 8, padding: 14, alignItems: "center" },
  secondaryButtonText: { fontFamily: fonts.bold, color: LOGIN_ACCENT, fontSize: typeScale.body },
  backText: { fontFamily: fonts.regular, color: colors.textMuted, textAlign: "center", marginTop: 8 },
  logoutText: { fontFamily: fonts.regular, color: colors.textMuted, textAlign: "center", marginTop: 24 },
  codeBox: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginBottom: 8,
  },
  code: { fontFamily: fonts.bold, fontSize: typeScale.subheading, letterSpacing: 6, color: LOGIN_ACCENT },
  });
}
