// Field sales — lead pipeline
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, TextInput, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/api";
import { showError } from "@/src/components/Toast";
import { colors, radius, formatINR } from "@/src/theme";

const STAGES = [
  { k: "", l: "All" },
  { k: "new", l: "New" },
  { k: "contacted", l: "Contacted" },
  { k: "visited", l: "Visited" },
  { k: "converted", l: "Won" },
  { k: "lost", l: "Lost" },
];
const STAGE_COLOR: any = {
  new: colors.info, contacted: colors.warning, visited: colors.primary, converted: colors.success, lost: colors.danger,
};

export default function FieldHome() {
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
    } catch (e: any) {
      showError(e?.message || "Could not load leads", "Load failed");
    } finally {
      setLoading(false);
    }
  }, [stage, q]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const counts = data?.counts || {};
  const totalPipeline = (data?.items || []).filter((l: any) => !["converted", "lost"].includes(l.status)).reduce((s: number, l: any) => s + (l.est_value || 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={[colors.primarySoft, colors.primary]} style={styles.hero}>
        <Text style={styles.hi}>My Pipeline</Text>
        <Text style={styles.heroVal}>{formatINR(totalPipeline)}</Text>
        <Text style={styles.heroSub}>{(counts.new || 0) + (counts.contacted || 0) + (counts.visited || 0)} open · {counts.converted || 0} won</Text>
        <TouchableOpacity style={styles.takeOrderBtn} onPress={() => router.push("/field/order-new")} testID="take-order-btn">
          <Ionicons name="cart" size={16} color={colors.primary} />
          <Text style={styles.takeOrderText}>Take an order</Text>
        </TouchableOpacity>
      </LinearGradient>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={14} color={colors.textSecondary} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search leads…" placeholderTextColor={colors.textTertiary} style={styles.searchInput} />
      </View>

      <View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STAGES}
          keyExtractor={(s) => s.k || "all"}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}
          renderItem={({ item: s }) => (
            <TouchableOpacity style={[styles.chip, stage === s.k && styles.chipActive]} onPress={() => setStage(s.k)}>
              <Text style={[styles.chipText, stage === s.k && styles.chipTextActive]}>{s.l}{s.k && counts[s.k] ? ` ${counts[s.k]}` : ""}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={data?.items || []}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="people-outline" size={42} color={colors.textTertiary} /><Text style={styles.emptyText}>No leads here. Tap + to add one.</Text></View>}
          renderItem={({ item: l }) => (
            <TouchableOpacity style={styles.card} onPress={() => router.push(`/lead/${l.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.shop} numberOfLines={1}>{l.shop_name}</Text>
                <Text style={styles.meta}>{l.area || ""}{l.phone ? ` · ${l.phone}` : ""}</Text>
                <View style={[styles.stagePill, { backgroundColor: (STAGE_COLOR[l.status] || colors.textSecondary) + "22" }]}>
                  <Text style={[styles.stageText, { color: STAGE_COLOR[l.status] || colors.textSecondary }]}>{l.status.toUpperCase()}</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                {!!l.est_value && <Text style={styles.value}>{formatINR(l.est_value)}</Text>}
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={{ marginTop: 6 }} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.push("/lead/new")} testID="add-lead-fab">
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { padding: 18, paddingTop: 20, paddingBottom: 18, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  hi: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "700" },
  heroVal: { color: "#FFF", fontSize: 30, fontWeight: "800", marginTop: 2, letterSpacing: -1 },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 12.5, marginTop: 4 },
  takeOrderBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFF", alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, marginTop: 12 },
  takeOrderText: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 12, marginTop: 12, marginBottom: 10, paddingHorizontal: 10, backgroundColor: colors.surface, borderRadius: 10, height: 38, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontSize: 13 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, height: 34 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#FFF" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8, marginTop: 4 },
  shop: { fontWeight: "800", color: colors.text, fontSize: 15 },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  stagePill: { alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginTop: 7 },
  stageText: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.3 },
  value: { fontWeight: "800", color: colors.text, fontSize: 14 },
  fab: { position: "absolute", right: 18, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  empty: { alignItems: "center", marginTop: 50, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
});
