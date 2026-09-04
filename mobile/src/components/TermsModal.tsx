import React, { useMemo, useRef, useState } from "react";
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { LOGIN_ACCENT, onColor } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";
import { TERMS_LAST_UPDATED, TERMS_SECTIONS } from "../constants/terms";

// Full-screen Terms & Conditions sheet. Two jobs: it's the readable copy of
// the terms, and it's the gate — "Accept" stays disabled until the reader has
// actually scrolled to the bottom, so acceptance means something.
//
// `onAccept` is what the sign-up flow hangs the account creation off; `onClose`
// is a plain dismiss and does NOT count as acceptance.
type TermsModalProps = {
  visible: boolean;
  onAccept: () => void;
  onClose: () => void;
  // Read-only mode for viewing the terms outside sign-up (e.g. from Settings):
  // no accept button, just a Done dismiss.
  readOnly?: boolean;
};

// A little slack so the button unlocks when the last line is on screen rather
// than demanding a pixel-exact bounce off the bottom.
const SCROLL_END_THRESHOLD = 24;

export default function TermsModal({ visible, onAccept, onClose, readOnly = false }: TermsModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [reachedEnd, setReachedEnd] = useState(false);
  // Short documents may not be scrollable at all — in that case there is no
  // scroll event to wait for, so onLayout/onContentSizeChange unlocks it.
  const viewportHeight = useRef(0);

  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - SCROLL_END_THRESHOLD) {
      setReachedEnd(true);
    }
  };

  const handleContentSizeChange = (_width: number, height: number) => {
    if (viewportHeight.current > 0 && height <= viewportHeight.current) setReachedEnd(true);
  };

  const canAccept = readOnly || reachedEnd;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top || 12 }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Terms & Conditions</Text>
            <Text style={styles.updated}>Last updated {TERMS_LAST_UPDATED}</Text>
          </View>
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close terms and conditions"
          >
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onLayout={(e) => {
            viewportHeight.current = e.nativeEvent.layout.height;
          }}
          onContentSizeChange={handleContentSizeChange}
        >
          {TERMS_SECTIONS.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={styles.heading}>{section.heading}</Text>
              <Text style={styles.body}>{section.body}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom || 16 }]}>
          {readOnly ? (
            <Pressable style={styles.acceptButton} onPress={onClose}>
              <Text style={styles.acceptButtonText}>Done</Text>
            </Pressable>
          ) : (
            <>
              {!reachedEnd && <Text style={styles.hint}>Scroll to the end to continue</Text>}
              <Pressable
                style={[styles.acceptButton, styles.acceptButtonLogin, !canAccept && styles.acceptButtonDisabled]}
                onPress={onAccept}
                disabled={!canAccept}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAccept }}
              >
                <Text style={[styles.acceptButtonText, styles.acceptButtonTextLogin]}>I Agree</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerText: { flex: 1 },
    title: { fontFamily: fonts.bold, fontSize: typeScale.subheading, color: colors.text },
    updated: { fontFamily: fonts.regular, fontSize: typeScale.caption, color: colors.textMuted, marginTop: 2 },
    closeButton: { padding: 4, marginLeft: 12 },
    scroll: { flex: 1 },
    scrollContent: { padding: 20, paddingBottom: 32 },
    section: { marginBottom: 20 },
    heading: { fontFamily: fonts.bold, fontSize: typeScale.body, color: colors.text, marginBottom: 6 },
    body: { fontFamily: fonts.regular, fontSize: typeScale.body, lineHeight: 22, color: colors.textMuted },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: 8,
    },
    hint: { fontFamily: fonts.regular, fontSize: typeScale.caption, color: colors.textMuted, textAlign: "center" },
    acceptButton: { backgroundColor: colors.accent, borderRadius: 8, padding: 14, alignItems: "center" },
    // Overrides the theme accent for the sign-up "I Agree" button only — the
    // read-only "Done" (opened from Settings) keeps the theme's own accent.
    acceptButtonLogin: { backgroundColor: LOGIN_ACCENT },
    acceptButtonDisabled: { opacity: 0.4 },
    acceptButtonText: { fontFamily: fonts.bold, color: colors.accentText, fontSize: typeScale.body },
    acceptButtonTextLogin: { color: onColor(LOGIN_ACCENT) },
  });
}
