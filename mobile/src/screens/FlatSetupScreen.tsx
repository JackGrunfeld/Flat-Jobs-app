import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useAuth } from "../context/AuthContext";
import * as flatService from "../services/flatService";
import { ApiError } from "../services/apiClient";

type FlowView = "choice" | "create" | "created" | "join";

// Port of FlatSetupPage.jsx: create-or-join-flat flow, plus an on-mount poll
// for a pending email invite (e.g. an invite sent moments before this user
// finished signing up — checkPendingInvite may not see it yet on the very
// first call, hence the one retry after a short delay).
export default function FlatSetupScreen() {
  const { refreshFlat, logout } = useAuth();
  const [view, setView] = useState<FlowView>("choice");
  const [flatName, setFlatName] = useState("");
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
          <Text style={styles.title}>Welcome!</Text>
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
          <TextInput style={styles.input} placeholder="e.g. 12 Main St" value={flatName} onChangeText={setFlatName} />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.primaryButton} onPress={handleCreate} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Create</Text>}
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
            autoCapitalize="characters"
            value={joinCode}
            onChangeText={setJoinCode}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.primaryButton} onPress={handleJoin} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Join</Text>}
          </Pressable>
          <Pressable onPress={() => setView("choice")}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 26, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 15, color: "#6B7280", textAlign: "center", marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 8, padding: 12, fontSize: 16 },
  codeInput: { textAlign: "center", letterSpacing: 4, fontSize: 20, fontWeight: "600" },
  error: { color: "#DC2626", textAlign: "center" },
  primaryButton: { backgroundColor: "#4F46E5", borderRadius: 8, padding: 14, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryButton: { borderWidth: 1, borderColor: "#4F46E5", borderRadius: 8, padding: 14, alignItems: "center" },
  secondaryButtonText: { color: "#4F46E5", fontSize: 16, fontWeight: "600" },
  backText: { color: "#6B7280", textAlign: "center", marginTop: 8 },
  logoutText: { color: "#9CA3AF", textAlign: "center", marginTop: 24 },
  codeBox: { backgroundColor: "#EEF2FF", borderRadius: 12, padding: 20, alignItems: "center", marginBottom: 8 },
  code: { fontSize: 32, fontWeight: "700", letterSpacing: 6, color: "#4F46E5" },
});
