// Pharmacist — my queries / disputes list
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { TYPE_LABEL, STATUS_COLOR, STATUS_LABEL } from "@/src/utils/queryLabels";
import { FileImage, VoicePlayer } from "@/src/components/FileMedia";
import { colors, radius } from "@/src/theme";

export default function MyDisputes() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems(await api("/disputes")); }
    catch (e: any) { showError(e?.message || "Could not load", "Load failed"); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const unflag = async (id: string) => {
    setBusy(id);
    try {
      await api(`/disputes/${id}/unflag`, { method: "POST" });
      showSuccess("Unflagged — ticket closed");
      load();
    } catch (e: any) { showError(e.message); }
    finally { setBusy(null); }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="mydisputes-back"><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={styles.topTitle}>My Queries</Text>
        <TouchableOpacity onPress={() => router.push("/dispute/new")} style={styles.addBtn} testID="new-dispute-btn"><Ionicons name="add" size={20} color="#FFF" /></TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="chatbox-ellipses-outline" size={42} color={colors.textTertiary} /><Text style={styles.emptyText}>No queries yet.{"\n"}Tap + to raise one.</Text></View>}
          renderItem={({ item: d }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.code}>{d.code} · {TYPE_LABEL[d.type] || d.type}{d.mode ? ` · ${d.mode === "sellable" ? "Sellable" : "Issue"}` : ""}</Text>
                <View style={[styles.statusPill, { backgroundColor: (STATUS_COLOR[d.status] || colors.textSecondary) + "22" }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[d.status] || colors.textSecondary }]}>{d.flagged ? "🚩 " : ""}{STATUS_LABEL[d.status] || (d.status || "").toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.qTitle}>{d.title}</Text>
              <Text style={styles.qMeta}>{d.distributor_name}{d.bill_numbers?.length ? ` · Bill ${d.bill_numbers.join(", ")}` : ""}</Text>
              {!!d.description && <Text style={styles.qDesc}>{d.description}</Text>}
              {(d.photo_file_ids?.length > 0 || d.audio_file_id) && (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {(d.photo_file_ids || []).map((id: string) => <FileImage key={id} id={id} size={52} />)}
                  {!!d.audio_file_id && <VoicePlayer id={d.audio_file_id} />}
                </View>
              )}
              {!!d.resolution && <Text style={styles.resolution}>Resolution: {d.resolution}</Text>}
              {["resolved", "rejected"].includes(d.status) && (
                <TouchableOpacity style={styles.unflag} onPress={() => unflag(d.id)} disabled={busy === d.id} testID={`unflag-${d.id}`}>
                  {busy === d.id ? <ActivityIndicator color="#FFF" /> : <Text style={styles.unflagText}>Confirm & Unflag</Text>}
                </TouchableOpacity>
              )}
              {["open", "in_progress"].includes(d.status) && <Text style={styles.waiting}>You can unflag once the distributor resolves it</Text>}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  addBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.primary },
  topTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
  card: { backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  code: { color: colors.textSecondary, fontWeight: "700", fontSize: 11.5 },
  statusPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  qTitle: { fontWeight: "800", color: colors.text, fontSize: 15, marginTop: 6 },
  qMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  resolution: { color: colors.success, fontSize: 12.5, marginTop: 8, fontWeight: "600" },
  qDesc: { color: colors.text, fontSize: 12.5, marginTop: 6 },
  unflag: { backgroundColor: colors.success, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 10 },
  unflagText: { color: "#FFF", fontWeight: "800" },
  waiting: { color: colors.textSecondary, fontSize: 11, marginTop: 8, fontStyle: "italic" },
  empty: { alignItems: "center", marginTop: 50, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: "center" },
});
