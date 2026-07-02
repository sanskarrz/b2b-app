// Pharmacist — raise a query/dispute with a distributor
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, TextInput } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius } from "@/src/theme";

const TYPES = [
  { k: "wrong_supply", l: "Wrong supplies", icon: "swap-horizontal" },
  { k: "return", l: "Order return", icon: "return-down-back" },
  { k: "credit", l: "Credit problem", icon: "card" },
  { k: "other", l: "Other", icon: "help-circle" },
];

export default function NewDispute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ distributor_id?: string; distributor_name?: string; order_id?: string }>();
  const [dists, setDists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [distId, setDistId] = useState<string>(params.distributor_id || "");
  const [type, setType] = useState("wrong_supply");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setDists(await api("/distributors")); }
    catch (e: any) { showError(e?.message || "Could not load", "Load failed"); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    if (!distId) { showError("Select a distributor"); return; }
    if (!title.trim()) { showError("Add a short title"); return; }
    setBusy(true);
    try {
      await api("/disputes", { method: "POST", body: { distributor_id: distId, type, title: title.trim(), description: desc.trim() || null, order_id: params.order_id || null } });
      showSuccess("Query raised — the distributor will respond");
      router.back();
    } catch (e: any) { showError(e?.message || "Could not submit", "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="dispute-back"><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={styles.topTitle}>Raise a Query</Text>
        <View style={{ width: 36 }} />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
          <Text style={styles.label}>Distributor</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {dists.map((d) => (
              <TouchableOpacity key={d.id} style={[styles.distChip, distId === d.id && styles.distChipActive]} onPress={() => setDistId(d.id)}>
                <Text style={[styles.distChipText, distId === d.id && { color: "#FFF" }]}>{d.short_name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.label}>Type of issue</Text>
          <View style={styles.typeGrid}>
            {TYPES.map((t) => (
              <TouchableOpacity key={t.k} style={[styles.typeCard, type === t.k && styles.typeCardActive]} onPress={() => setType(t.k)} testID={`type-${t.k}`}>
                <Ionicons name={t.icon as any} size={18} color={type === t.k ? "#FFF" : colors.primary} />
                <Text style={[styles.typeText, type === t.k && { color: "#FFF" }]}>{t.l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Title</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Received wrong strength" placeholderTextColor={colors.textTertiary} style={styles.input} testID="dispute-title" />
          <Text style={styles.label}>Details</Text>
          <TextInput value={desc} onChangeText={setDesc} placeholder="Describe the issue…" placeholderTextColor={colors.textTertiary} style={[styles.input, { minHeight: 90 }]} multiline />

          <TouchableOpacity style={[styles.submitBtn, busy && { opacity: 0.5 }]} onPress={submit} disabled={busy} testID="submit-dispute">
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>Submit Query</Text>}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  topTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  distChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  distChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  distChipText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12.5 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeCard: { width: "48%", flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: "#FFF" },
  typeCardActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeText: { fontWeight: "700", color: colors.text, fontSize: 12.5 },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.text, fontSize: 15 },
  submitBtn: { backgroundColor: colors.primary, paddingVertical: 15, borderRadius: 12, alignItems: "center", marginTop: 24 },
  submitText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
});
