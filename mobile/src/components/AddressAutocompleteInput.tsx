import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  TextInput,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import * as placesService from "../services/placesService";
import type { AddressPrediction } from "../services/placesService";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

// A short unique-enough id, not a real UUID — all it has to do is group one
// address-editing session's autocomplete keystrokes with the details call
// that finishes it, which is the entire job of Google's session tokens.
function newSessionToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  style?: StyleProp<TextStyle>;
};

// A plain TextInput with live Google Places suggestions dropped in
// underneath as someone types — tapping one fills in Google's own
// formatted address (road, city, postcode). Typing without ever picking a
// suggestion still works; this only ever adds to what's in the field, it
// doesn't gate it. Fails silently into a plain text field if the lookup
// 503s — the Worker's Places key isn't configured yet — or the device is
// offline.
export default function AddressAutocompleteInput({ value, onChangeText, placeholder, placeholderTextColor, style }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const sessionToken = useRef(newSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a slow earlier request clobbering a faster later one —
  // only the response for the most recent keystroke is ever applied.
  const requestId = useRef(0);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChangeText = (text: string) => {
    onChangeText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = text.trim();
    if (trimmed.length < MIN_CHARS) {
      setPredictions([]);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const thisRequest = ++requestId.current;
      setLoading(true);
      try {
        const { predictions: results } = await placesService.autocompleteAddress(trimmed, sessionToken.current);
        if (thisRequest === requestId.current) setPredictions(results);
      } catch {
        if (thisRequest === requestId.current) setPredictions([]);
      } finally {
        if (thisRequest === requestId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
  };

  const selectPrediction = async (prediction: AddressPrediction) => {
    setPredictions([]);
    // Fills in immediately with the prediction's own text — the details
    // round trip below only refines it to Google's canonical formatting,
    // it isn't what makes the selection feel like it worked.
    onChangeText(prediction.description);
    try {
      const { address } = await placesService.fetchAddressDetails(prediction.placeId, sessionToken.current);
      if (address) onChangeText(address);
    } catch {
      // The prediction's own description is already a usable address.
    } finally {
      // A finished autocomplete session gets a fresh token for the next
      // one, per Google's own guidance on session token reuse.
      sessionToken.current = newSessionToken();
    }
  };

  const showDropdown = focused && (predictions.length > 0 || loading);

  return (
    <View>
      <TextInput
        style={style}
        value={value}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        onFocus={() => setFocused(true)}
        // Delayed past the tap-on-a-suggestion's own touch handling, so
        // selecting a row doesn't get raced by the blur that tore its list
        // down first.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        autoCorrect={false}
      />
      {showDropdown && (
        <View style={styles.dropdown}>
          {loading && predictions.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : (
            predictions.map((p, i) => (
              <Pressable
                key={p.placeId}
                style={[styles.row, i === predictions.length - 1 && styles.rowLast]}
                onPress={() => selectPrediction(p)}
              >
                <Text style={styles.rowText} numberOfLines={2}>
                  {p.description}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    dropdown: {
      marginTop: 4,
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      overflow: "hidden",
    },
    row: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowLast: { borderBottomWidth: 0 },
    rowText: { fontFamily: fonts.regular, fontSize: typeScale.body, color: colors.text },
    loadingRow: { paddingVertical: 12, alignItems: "center" },
  });
}
