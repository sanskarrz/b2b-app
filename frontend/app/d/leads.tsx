// Owner/Manager — CRM leads (all reps)
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, TextInput } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError } from "@/src/components/Toast";
import { colors, radius, formatINR } from "@/src/theme";

const STAGES = [
  { k: "", l: "All" }, { k: "new", l: "New" }, { k: "contacted", l: "Contacted" },
  { k: "visited", l: "Visited" }, { k: "converted", l: "Won" }, { k: "lost", l: "Lost" },
];
const STAGE_COLOR: any = { new: colors.info, contacted: colors.warning, visited: colors.primary, converted: colors.success, lost: colors.danger };

export default function OwnerLeads() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (stage) qs.set("status", stage);
      if (q) qs.set("q", q);
      setData(await api(`/distributor/me/leads?${qs.toString()}`));
    } catch (e: any) { showError(e?.message || "Could not load leads", "Load failed"); }
    finally { setLoading(false); }
  }, [stage, q]);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const counts = data?.counts || {};

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={styles.topTitle}>Sales CRM</Text>
        <TouchableOpacity onPress={() => router.push("/lead/new")} style={styles.addBtn}><Ionicons name="add" size={20} color="#FFF" /></TouchableOpacity>
      </View>

      <View style={styles.kpiRow}>
        <View style={styles.kpi}><Text style={styles.kpiVal}>{(counts.new || 0) + (counts.contacted || 0) + (counts.visited || 0)}</Text><Text style={styles.kpiLabel}>Open</Text></View>
        <View style={styles.kpi}><Text style={[styles.kpiVal, { color: colors.success }]}>{counts.converted || 0}</Text><Text style={styles.kpiLabel}>Won</Text></View>
        <View style={styles.kpi}><Text style={[styles.kpiVal, { color: colors.danger }]}>{counts.lost || 0}</Text><Text style={styles.kpiLabel}>Lost</Text></View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={14} color={colors.textSecondary} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search leads…" placeholderTextColor={colors.textTertiary} style={styles.searchInput} />
      </View>

      <FlatList
        horizontal showsHorizontalScrollIndicator={false} data={STAGES} keyExtractor={(s) => s.k || "all"}
        style={{ maxHeight: 44 }} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}
        renderItem={({ item: s }) => (
          <TouchableOpacity style={[styles.chip, stage === s.k && styles.chipActive]} onPress={() => setStage(s.k)}>
            <Text style={[styles.chipText, stage === s.k && styles.chipTextActive]}>{s.l}</Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={data?.items || []}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="funnel-outline" size={42} color={colors.textTertiary} /><Text style={styles.emptyText}>No leads here</Text></View>}
          renderItem={({ item: l }) => (
            <TouchableOpacity style={styles.card} onPress={() => router.push(`/lead/${l.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.shop} numberOfLines={1}>{l.shop_name}</Text>
                <Text style={styles.meta}>{l.assigned_to_name ? `${l.assigned_to_name} · ` : ""}{l.area || ""}</Text>
                <View style={[styles.stagePill, { backgroundColor: (STAGE_COLOR[l.status] || colors.textSecondary) + "22" }]}>
                  <Text style={[styles.stageText, { color: STAGE_COLOR[l.status] || colors.textSecondary }]}>{l.status.toUpperCase()}</Text>
                </View>
              </View>
              {!!l.est_value && <Text style={styles.value}>{formatINR(l.est_value)}</Text>}
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
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
  kpiRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, marginBottom: 8 },
  kpi: { flex: 1, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 11, alignItems: "center" },
  kpiVal: { fontSize: 20, fontWeight: "800", color: colors.text },
  kpiLabel: { fontSize: 10.5, color: colors.textSecondary, fontWeight: "700", marginTop: 2 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 10, backgroundColor: colors.surface, borderRadius: 10, height: 38, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontSize: 13 },
  chip: { paddingHorizontal: 14, height: 32, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#FFF" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  shop: { fontWeight: "800", color: colors.text, fontSize: 15 },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  stagePill: { alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginTop: 7 },
  stageText: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.3 },
  value: { fontWeight: "800", color: colors.text, fontSize: 14 },
  empty: { alignItems: "center", marginTop: 50, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
});
