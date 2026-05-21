import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { colors, radius } from "@/src/theme";

const TYPES = [
  { key: "invoice", label: "Invoice / Billing" },
  { key: "order", label: "Order Issue" },
  { key: "delivery", label: "Delivery" },
  { key: "other", label: "Other" },
];

export default function ReportIssue() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; reference_id?: string; reference_label?: string }>();
  const [type, setType] = useState(params.type || "other");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (message.trim().length < 5) {
      Alert.alert("Need details", "Please describe the issue (min 5 chars)");
      return;
    }
    setSubmitting(true);
    try {
      await api("/issues", {
        method: "POST",
        body: {
          type,
          reference_id: params.reference_id,
          reference_label: params.reference_label,
          message: message.trim(),
        },
      });
      Alert.alert("Report submitted", "Our team will review and respond shortly.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Report a problem" showBack />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {params.reference_label ? (
            <View style={styles.refCard}>
              <Ionicons name="link-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.refText}>Linked: {params.reference_label}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Issue type</Text>
          <View style={styles.types}>
            {TYPES.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.typeChip, type === t.key && styles.typeChipActive]}
                onPress={() => setType(t.key)}
                testID={`issue-type-${t.key}`}
              >
                <Text style={[styles.typeText, type === t.key && styles.typeTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 18 }]}>Describe the issue</Text>
          <TextInput
            style={styles.textarea}
            value={message}
            onChangeText={setMessage}
            placeholder="e.g. Wrong amount on this invoice, scheme not applied, delivery missing items…"
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            testID="issue-message"
          />

          <View style={{ height: 20 }} />
          <Button
            title="Submit Report"
            onPress={submit}
            loading={submitting}
            disabled={message.trim().length < 5}
            fullWidth
            testID="issue-submit"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  refCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  label: { fontWeight: "700", fontSize: 13, color: colors.text, marginBottom: 8 },
  types: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  typeTextActive: { color: "#FFF" },
  textarea: {
    minHeight: 140,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
});
