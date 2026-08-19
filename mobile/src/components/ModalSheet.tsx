import React, { useMemo, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { typeScale } from "../theme/typography";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** The form fields. Scrolls on its own when the keyboard eats the height. */
  children: ReactNode;
  /**
   * Actions. Pinned below the scroll area rather than sitting at the end of
   * it, so the submit button stays on screen while someone is still typing —
   * the old forms buried it under the keyboard.
   */
  footer?: ReactNode;
};

// One shell behind every add/edit popup in the app. Before this each modal
// carried its own backdrop, card and buttons, which is why they had drifted
// into three different looks (8pt vs 16pt radii, muted-vs-accent buttons) and
// why none of them handled the keyboard: a centred card with no avoidance
// puts the inputs behind it on a small phone.
//
// What the shell owns: the scrim, the card, the title row with its close
// button, keyboard avoidance, and the footer. Screens supply fields only.
export default function ModalSheet({ visible, title, onClose, children, footer }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* "padding" is the only behaviour that works with a centred card on
          iOS; Android resizes the window itself, so "height" is enough. The
          card's maxHeight is a share of whatever space is left over, which is
          what makes it shrink and scroll instead of hiding under the keys. */}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          {/* Swallows taps so hitting the card itself doesn't dismiss it. */}
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <Pressable
                style={styles.close}
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            {footer ? (
              // Bottom inset only matters on Android, where the card can sit
              // against the gesture bar once the keyboard pushes it down.
              <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom - 8, 0) }]}>{footer}</View>
            ) : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fill: { flex: 1 },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      padding: 20,
    },
    // Same card treatment as the tiles on the tabs behind it: raised surface,
    // 1.5pt border, generous radius.
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: colors.border,
      maxHeight: "88%",
      overflow: "hidden",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingLeft: 18,
      paddingRight: 12,
      paddingTop: 16,
      paddingBottom: 12,
    },
    title: {
      flex: 1,
      fontFamily: fonts.display,
      fontSize: typeScale.subheading,
      letterSpacing: 1,
      color: colors.text,
    },
    // Deliberately the settings gear's geometry — a 32pt rounded square on the
    // alt surface — so the corner button reads the same everywhere in the app.
    close: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    // flexShrink lets the scroll area give up height to the keyboard; without
    // it the card keeps its full height and the footer goes off screen.
    body: { flexShrink: 1 },
    bodyContent: { paddingHorizontal: 18, paddingBottom: 4 },
    footer: {
      paddingHorizontal: 18,
      paddingTop: 12,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
  });
}

// The form vocabulary the modals share: one label, input, chip and button
// treatment across all of them. Kept here next to the shell so a modal is
// styled by importing rather than by re-declaring 60 lines of StyleSheet.
export function createFormStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fieldLabel: {
      fontFamily: fonts.bold,
      fontSize: typeScale.caption,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      color: colors.textMuted,
      marginTop: 14,
      marginBottom: 6,
    },
    input: {
      fontFamily: fonts.regular,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: typeScale.body,
      color: colors.text,
    },
    multiline: { minHeight: 72, textAlignVertical: "top" },
    row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    chip: {
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: {
      fontFamily: fonts.bold,
      fontSize: typeScale.caption,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: colors.textMuted,
    },
    chipTextActive: { color: colors.accentText },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      padding: 14,
      alignItems: "center",
    },
    primaryButtonDisabled: { opacity: 0.45 },
    primaryButtonText: {
      fontFamily: fonts.bold,
      color: colors.accentText,
      fontSize: typeScale.caption,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    dangerButton: {
      backgroundColor: colors.dangerSoft,
      borderWidth: 1.5,
      borderColor: colors.danger,
      borderRadius: 12,
      padding: 12,
      alignItems: "center",
    },
    dangerButtonText: {
      fontFamily: fonts.bold,
      color: colors.danger,
      fontSize: typeScale.caption,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    hint: {
      fontFamily: fonts.regular,
      fontSize: typeScale.body,
      color: colors.textMuted,
      fontStyle: "italic",
      marginTop: 12,
    },
  });
}
