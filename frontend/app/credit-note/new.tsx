// Create Credit Note (issued by distributor — used for refund/damage)
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useState, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";
import { confirm } from "@/src/components/confirm";

const REASONS = [
  { k: "damaged", l: "Damaged stock" },
  { k: "expired", l: "Near/expired" },
  { k: "wrong-supply", l: "Wrong supply" },
  { k: "return-refund", l: "Return refund" },
  { k: "scheme-adjust", l: "Scheme adjustment" },
  { k: "settlement", l: "Early settlement" },
  { k: "other", l: "Other" },
];

export default function NewCreditNote() {
  const params = useLocalSearchParams<{ distributor_id?: string }>();
  const router = useRouter();
  const [distributors, setDistributors] = useState<any[]>([]);
  const [distributorId, setDistributorId] = useState<string>(params.distributor_id || "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("damaged");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api("/distributors").then(setDistributors).catch(() => {});
  }, []);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!distributorId || !amt || amt <= 0) {
      confirm("Missing info", "Pick a distributor and enter a valid amount.", [{ text: "OK" }]);
      return;
    }
    setSubmitting(true);
    try {
      await api("/credit-notes", {
        method: "POST",
        body: {
          distributor_id: distributorId,
          amount: amt,
          reason,
          notes: notes.trim() || null,
        },
      });
      confirm("Credit Note created", `₹${amt.toLocaleString("en-IN")} adjusted on ledger.`, [
        {
          text: "View Ledger",
          onPress: () => router.replace(`/ledger/${distributorId}`),
        },
      ]);
    } catch (e: any) {
      confirm("Error", e.message, [{ text: "OK" }]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="New Credit Note" subtitle="Adjust ledger balance" showBack />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
          <Text style={styles.label}>Distributor</Text>
          <View style={styles.distList}>
            {distributors.map((d: any) => (
              <TouchableOpacity
                key={d.id}
                style={[styles.distChip, distributorId === d.id && styles.distChipActive]}
                onPress={() => setDistributorId(d.id)}
              >
                <Text style={[styles.distChipText, distributorId === d.id && styles.distChipTextActive]}>
                  {d.short_name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 18 }]}>Amount (₹)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textTertiary}
            testID="cn-amount"
          />
          {amount && parseFloat(amount) > 0 && (
            <Text style={styles.amountPreview}>{formatINRFull(parseFloat(amount))}</Text>
          )}

          <Text style={[styles.label, { marginTop: 18 }]}>Reason</Text>
          <View style={styles.reasonGrid}>
            {REASONS.map((r) => (
              <TouchableOpacity
                key={r.k}
                style={[styles.reasonChip, reason === r.k && styles.reasonChipActive]}
                onPress={() => setReason(r.k)}
              >
                <Text style={[styles.reasonText, reason === r.k && styles.reasonTextActive]}>{r.l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 18 }]}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, { height: 80, textAlignVertical: "top" }]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="E.g., 5 strips returned, batch B-234..."
            placeholderTextColor={colors.textTertiary}
          />

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={14} color={colors.info} />
            <Text style={styles.infoText}>
              Credit note will be added to your ledger and the distributor&apos;s outstanding credit usage will be reduced accordingly.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, (submitting || !distributorId || !amount) && { opacity: 0.5 }]}
            onPress={submit}
            disabled={submitting || !distributorId || !amount}
            testID="cn-submit"
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="document-text" size={16} color="#FFF" />
                <Text style={styles.submitText}>Create Credit Note</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  label: { fontSize: 12, color: colors.textSecondary, fontWeight: "700", letterSpacing: 0.4, marginBottom: 8 },
  distList: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  distChip: {
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1, borderColor: colors.border,
  },
  distChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  distChipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  distChipTextActive: { color: "#FFF" },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: colors.text,
  },
  amountPreview: { color: colors.primary, fontWeight: "800", fontSize: 16, marginTop: 6 },
  reasonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reasonChip: {
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: colors.surface, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border,
  },
  reasonChipActive: { backgroundColor: colors.accentBg, borderColor: colors.accent },
  reasonText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  reasonTextActive: { color: colors.accent, fontWeight: "800" },
  infoBox: {
    marginTop: 18, padding: 12,
    backgroundColor: colors.infoBg, borderRadius: 10,
    borderWidth: 1, borderColor: colors.info,
    flexDirection: "row", gap: 8, alignItems: "flex-start",
  },
  infoText: { color: colors.text, fontSize: 11.5, flex: 1, lineHeight: 16 },
  submitBtn: {
    marginTop: 24,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
});
