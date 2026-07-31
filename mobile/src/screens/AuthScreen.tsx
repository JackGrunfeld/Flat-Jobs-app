import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/apiClient";

// Port of AuthPage.jsx: a single login/signup toggle form, now with
// Google/Apple sign-in alongside email/password (email/password kept per the
// migration plan's decision to offer all three).
export default function AuthScreen() {
  const { signup, login, loginWithGoogle, loginWithApple } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        if (!name.trim()) throw new ApiError(400, "Enter your name");
        await signup(name.trim(), email.trim(), password);
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
      <Text style={styles.title}>Flat Jobs</Text>

      {mode === "signup" && (
        <TextInput style={styles.input} placeholder="Your name" value={name} onChangeText={setName} />
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>{mode === "signup" ? "Sign up" : "Log in"}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => setMode(mode === "signup" ? "login" : "signup")}>
        <Text style={styles.switchModeText}>
          {mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
        </Text>
      </Pressable>

      <View style={styles.divider} />

      <Pressable style={styles.oauthButton} onPress={handleGoogleSignIn} disabled={submitting}>
        <Text style={styles.oauthButtonText}>Continue with Google</Text>
      </Pressable>

      {Platform.OS === "ios" && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={8}
          style={styles.appleButton}
          onPress={handleAppleSignIn}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: "700", textAlign: "center", marginBottom: 24 },
  input: { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 8, padding: 12, fontSize: 16 },
  error: { color: "#DC2626", textAlign: "center" },
  primaryButton: { backgroundColor: "#4F46E5", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 4 },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  switchModeText: { color: "#4F46E5", textAlign: "center", marginTop: 8 },
  divider: { height: 1, backgroundColor: "#E5E7EB", marginVertical: 16 },
  oauthButton: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  oauthButtonText: { fontSize: 16, fontWeight: "500" },
  appleButton: { height: 48, marginTop: 12 },
});
