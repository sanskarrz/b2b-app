// Pharmacy — flag an issue / raise a query ticket with a distributor
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useCallback, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { IssueForm, emptyIssue, issuePayload } from "@/src/components/IssueForm";
import { colors } from "@/src/theme";

export default function NewDispute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ distributor_id?: string; order_id?: string; title?: string }>();
  const [dists, setDists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [distId, setDistId] = useState<string>(params.distributor_id || "");
  const [issue, setIssue] = useState(emptyIssue(params.title || ""));
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    api("/retail/distributors?tab=mapped").then((r) => setDists(r.items)).catch((e) => showError(e.message)).finally(() => setLoading(false));
  }, []));

  const submit = async () => {
    if (!distId) return showError("Select a distributor");
    if (!issue.category) return showError("Pick an issue category");
    if (!issue.title.trim()) return showError("Add the product name");
    setBusy(true);
    try {
      await api("/disputes", { method: "POST", body: { distributor_id: distId, order_id: params.order_id || null, source: params.order_id ? "order" : "manual", ...issuePayload(issue) } });
      showSuccess("Issue flagged — the distributor has been notified");
      router.back();
    } catch (e: any) {
      showError(e?.message || "Could not submit", "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="dispute-back"><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={styles.topTitle}>Flag an Issue</Text>
        <View style={{ width: 44 }} />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Distributor</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4, marginBottom: 14 }}>
              {dists.map((d) => (
                <TouchableOpacity key={d.id} style={[styles.distChip, distId === d.id && styles.distChipActive]} onPress={() => setDistId(d.id)} testID={`dispute-dist-${d.id}`}>
                  <Text style={[styles.distChipText, distId === d.id && { color: "#FFF" }]}>{d.short_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <IssueForm value={issue} onChange={setIssue} />
            <TouchableOpacity style={[styles.submitBtn, busy && { opacity: 0.5 }]} onPress={submit} disabled={busy} testID="submit-dispute">
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>Flag & Raise Query</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  topTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
  label: { fontSize: 12, fontWeight: "800", color: colors.textSecondary, marginBottom: 6 },
  distChip: { paddingHorizontal: 14, height: 38, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  distChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  distChipText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12.5 },
  submitBtn: { backgroundColor: colors.primary, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 24 },
  submitText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
});
