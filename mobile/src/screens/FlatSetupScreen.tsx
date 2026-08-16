import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useAuth } from "../context/AuthContext";
import * as flatService from "../services/flatService";
import { ApiError } from "../services/apiClient";
import { useTypewriterCycle } from "../hooks/useTypewriterCycle";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";

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
  const [joinCode, setJoinCode] = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const polledOnce = useRef(false);
  const { text: welcomeText, cursorOn: welcomeCursorOn } = useTypewriterCycle(WELCOME_WORDS);

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
      if (!flatName.trim()) throw new ApiError(400, "Enter a flat name");
      const { flat } = await flatService.createFlat(flatName.trim());
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
            {welcomeText}
            <Text style={[styles.titleCursor, { opacity: welcomeCursorOn ? 1 : 0 }]}>▌</Text>
          </Text>
          <Text style={styles.subtitle}>Create a new flat, or join one with a code.</Text>
          <Pressable style={styles.primaryButton} onPress={() => setView("create")}>
            <Text style={styles.primaryButtonText}>Create a flat</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => setView("join")}>
            <Text style={styles.secondaryButtonText}>Join a flat</Text>
          </Pressable>
          <Pressable onPress={() => logout()}>
            <Text style={styles.logoutText}>Sign out</Text>
          </Pressable>
        </>
      )}

      {view === "create" && (
        <>
          <Text style={styles.title}>Name your flat</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 12 Main St"
            placeholderTextColor={colors.textMuted}
            value={flatName}
            onChangeText={setFlatName}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.primaryButton} onPress={handleCreate} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.accentText} /> : <Text style={styles.primaryButtonText}>Create</Text>}
          </Pressable>
          <Pressable onPress={() => setView("choice")}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </>
      )}

      {view === "created" && (
        <>
          <Text style={styles.title}>Flat created!</Text>
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
            {busy ? <ActivityIndicator color={colors.accentText} /> : <Text style={styles.primaryButtonText}>Join</Text>}
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
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12, backgroundColor: colors.bg },
  title: { fontFamily: fonts.bold, fontSize: typeScale.subheading, textAlign: "center", color: colors.text, marginBottom: 12 },
  titleCursor: { color: colors.accentInk },
  subtitle: { fontFamily: fonts.regular, fontSize: typeScale.body, color: colors.textMuted, textAlign: "center", marginBottom: 12 },
  input: { fontFamily: fonts.regular, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 8, padding: 12, fontSize: typeScale.body, color: colors.text },
  codeInput: { fontFamily: fonts.bold, textAlign: "center", letterSpacing: 4, fontSize: typeScale.body },
  error: { fontFamily: fonts.regular, color: colors.danger, textAlign: "center" },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center" },
  primaryButtonText: { fontFamily: fonts.bold, color: colors.accentText, fontSize: typeScale.body },
  secondaryButton: { borderWidth: 1, borderColor: colors.accentInk, borderRadius: 8, padding: 14, alignItems: "center" },
  secondaryButtonText: { fontFamily: fonts.bold, color: colors.accentInk, fontSize: typeScale.body },
  backText: { fontFamily: fonts.regular, color: colors.textMuted, textAlign: "center", marginTop: 8 },
  logoutText: { fontFamily: fonts.regular, color: colors.textMuted, textAlign: "center", marginTop: 24 },
  codeBox: { backgroundColor: colors.surface, borderRadius: 12, padding: 20, alignItems: "center", marginBottom: 8 },
  code: { fontFamily: fonts.bold, fontSize: typeScale.subheading, letterSpacing: 6, color: colors.accentInk },
  });
}
