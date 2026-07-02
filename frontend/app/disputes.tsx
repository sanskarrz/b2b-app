// Pharmacist — my queries / disputes list
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError } from "@/src/components/Toast";
import { colors, radius } from "@/src/theme";

const TYPE_LABEL: any = { wrong_supply: "Wrong supplies", return: "Order return", credit: "Credit problem", other: "Other" };
const STATUS_COLOR: any = { open: colors.warning, in_progress: colors.info, resolved: colors.success, rejected: colors.danger };

export default function MyDisputes() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setItems(await api("/disputes")); }
    catch (e: any) { showError(e?.message || "Could not load", "Load failed"); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

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
                <Text style={styles.code}>{d.code} · {TYPE_LABEL[d.type]}</Text>
                <View style={[styles.statusPill, { backgroundColor: (STATUS_COLOR[d.status] || colors.textSecondary) + "22" }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[d.status] || colors.textSecondary }]}>{(d.status || "").toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.qTitle}>{d.title}</Text>
              <Text style={styles.qMeta}>{d.distributor_name}</Text>
              {!!d.resolution && <Text style={styles.resolution}>Resolution: {d.resolution}</Text>}
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
  empty: { alignItems: "center", marginTop: 50, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: "center" },
});
