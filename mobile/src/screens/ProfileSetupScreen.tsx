import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import AnimatedInput from "../components/AnimatedInput";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ApiError } from "../services/apiClient";
import { PICKER_COUNTRIES, countryName } from "../constants/countries";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Opens centred on a plausible adult birth year rather than today, which is a
// far better starting scroll position for a birthdate.
const DEFAULT_BIRTHDAY = new Date(new Date().getFullYear() - 25, 0, 1);
// Matches the minimum age stated in the Terms (section 2).
const MIN_AGE_YEARS = 16;

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

// Whole years elapsed, so it ticks over on the birthday itself rather than
// some fraction of a year either side.
function ageFrom(birthday: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthday.getFullYear();
  const monthDelta = today.getMonth() - birthday.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthday.getDate())) age -= 1;
  return age;
}

// Collected after the account exists rather than on the sign-up form, so the
// sign-up step stays credentials-only. RootNavigator keeps routing here until
// every field is on file, which also catches Google/Apple signups (they arrive
// with a provider name but no birthday or country) and pre-existing accounts.
export default function ProfileSetupScreen() {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { currentUser, updateProfile, logout } = useAuth();

  const inputTheme = useMemo(
    () => ({
      accentColor: colors.accentInk,
      idleBorderColor: colors.inputBorder,
      idleLabelColor: colors.textMuted,
      idleTextColor: colors.textMuted,
    }),
    [colors],
  );

  // Prefill whatever the provider already gave us — an Apple/Google signup
  // usually arrives with a real full name, so that field is often already done.
  const [fullName, setFullName] = useState(currentUser?.displayName ?? "");
  const [birthday, setBirthday] = useState<Date | null>(
    currentUser?.birthday ? new Date(`${currentUser.birthday}T00:00:00`) : null,
  );
  const [country, setCountry] = useState<string | null>(currentUser?.country ?? null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<{
    fullName?: boolean;
    birthday?: boolean;
    country?: boolean;
  }>({});

  const age = birthday ? ageFrom(birthday) : null;

  const onAndroidBirthdayChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShowDatePicker(false);
    if (event.type === "set" && selected) setBirthday(selected);
  };

  const handleSubmit = async () => {
    setError(null);
    const missing: typeof invalidFields = {};
    if (!fullName.trim()) missing.fullName = true;
    if (!birthday) missing.birthday = true;
    if (!country) missing.country = true;
    if (Object.keys(missing).length > 0) {
      setInvalidFields(missing);
      return;
    }
    if (age !== null && age < MIN_AGE_YEARS) {
      setInvalidFields({ birthday: true });
      setError(`You must be at least ${MIN_AGE_YEARS} to use Flatr.`);
      return;
    }

    setInvalidFields({});
    setSubmitting(true);
    try {
      await updateProfile({
        displayName: fullName.trim(),
        birthday: toISODateString(birthday!),
        country: country!,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Almost there</Text>
        <Text style={styles.subtitle}>
          Tell your flatmates who you are. Your name and birthday show up in your flat — your birthday also
          adds itself to the shared calendar.
        </Text>

        <View style={styles.form}>
          <AnimatedInput
            {...inputTheme}
            label="Full name"
            error={invalidFields.fullName}
            value={fullName}
            autoCapitalize="words"
            textContentType="name"
            onChangeText={(t) => {
              setFullName(t);
              setInvalidFields((f) => (f.fullName ? { ...f, fullName: false } : f));
            }}
          />

          <Pressable
            onPress={() => {
              setInvalidFields((f) => (f.birthday ? { ...f, birthday: false } : f));
              setShowDatePicker(true);
            }}
          >
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
          {age !== null && <Text style={styles.ageHint}>{age} years old</Text>}

          <Pressable
            onPress={() => {
              setInvalidFields((f) => (f.country ? { ...f, country: false } : f));
              setShowCountryPicker(true);
            }}
          >
            <View pointerEvents="none">
              <AnimatedInput
                {...inputTheme}
                label="Country"
                error={invalidFields.country}
                editable={false}
                value={countryName(country) ?? ""}
              />
            </View>
          </Pressable>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={colors.accentText} />
            ) : (
              <Text style={styles.primaryButtonText}>Continue</Text>
            )}
          </Pressable>

          <Pressable style={styles.linkButton} onPress={logout} disabled={submitting}>
            <Text style={styles.linkButtonText}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>

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
          <Pressable style={styles.sheetBackdrop} onPress={() => setShowDatePicker(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
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
              <Pressable style={styles.sheetDoneButton} onPress={() => setShowDatePicker(false)}>
                <Text style={styles.sheetDoneText}>Done</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <Modal
        visible={showCountryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowCountryPicker(false)}>
          <Pressable style={[styles.sheet, styles.countrySheet]} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Select country</Text>
            <FlatList
              data={PICKER_COUNTRIES}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.countryRow}
                  onPress={() => {
                    setCountry(item.code);
                    setShowCountryPicker(false);
                  }}
                >
                  <Text style={styles.countryName}>{item.name}</Text>
                  {country === item.code && (
                    <Ionicons name="checkmark" size={18} color={colors.accentInk} />
                  )}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 32, paddingVertical: 48 },
    title: { fontFamily: fonts.display, fontSize: typeScale.subheading, color: colors.text },
    subtitle: {
      fontFamily: fonts.regular,
      fontSize: typeScale.body,
      lineHeight: 20,
      color: colors.textMuted,
      marginTop: 8,
    },
    form: { gap: 10, marginTop: 32 },
    ageHint: {
      fontFamily: fonts.regular,
      fontSize: typeScale.body,
      color: colors.textMuted,
      marginTop: -4,
      marginLeft: 4,
    },
    error: { fontFamily: fonts.regular, color: colors.danger, textAlign: "center", marginTop: 4 },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: 8,
      padding: 12,
      alignItems: "center",
      marginTop: 18,
    },
    primaryButtonText: { fontFamily: fonts.bold, color: colors.accentText, fontSize: typeScale.body },
    linkButton: { alignItems: "center", paddingVertical: 12 },
    linkButtonText: { fontFamily: fonts.regular, color: colors.textMuted, fontSize: typeScale.body },

    // Stays a dark scrim in both schemes — it dims the page behind the sheet
    // rather than being part of it.
    sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingBottom: 24,
    },
    countrySheet: { maxHeight: "70%", paddingTop: 8 },
    sheetTitle: {
      fontFamily: fonts.bold,
      fontSize: typeScale.body,
      color: colors.text,
      textAlign: "center",
      paddingVertical: 12,
    },
    sheetDoneButton: { alignItems: "center", paddingVertical: 14, marginHorizontal: 16 },
    sheetDoneText: { fontFamily: fonts.bold, color: colors.accentInk, fontSize: typeScale.body },
    countryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    countryName: { fontFamily: fonts.regular, fontSize: typeScale.body, color: colors.text },
  });
}
