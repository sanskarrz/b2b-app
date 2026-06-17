// Delivery rider — today's assigned deliveries
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/api";
import { showError } from "@/src/components/Toast";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function DeliveryHome() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([api("/delivery/me/orders"), api("/delivery/me/summary")]);
      setOrders(o);
      setSummary(s);
    } catch (e: any) {
      showError(e?.message || "Could not load deliveries", "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <LinearGradient colors={[colors.primarySoft, colors.primary]} style={styles.hero}>
        <Text style={styles.hi}>Hi, {summary?.rider_name || "Rider"} 👋</Text>
        <Text style={styles.heroSub}>You have {summary?.pending || 0} deliveries to complete</Text>
        <View style={styles.statRow}>
          <View style={styles.stat}><Text style={styles.statVal}>{summary?.pending ?? 0}</Text><Text style={styles.statLabel}>Pending</Text></View>
          <View style={styles.stat}><Text style={styles.statVal}>{summary?.delivered_today ?? 0}</Text><Text style={styles.statLabel}>Done today</Text></View>
          <View style={styles.stat}><Text style={styles.statVal}>{summary?.failed ?? 0}</Text><Text style={styles.statLabel}>Failed</Text></View>
        </View>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="checkmark-circle-outline" size={48} color={colors.success} /><Text style={styles.emptyText}>All caught up! No pending deliveries.</Text></View>}
          renderItem={({ item: o }) => (
            <TouchableOpacity style={styles.card} onPress={() => router.push(`/delivery/order/${o.id}`)}>
              <View style={styles.cardTop}>
                <Text style={styles.code}>{o.code}</Text>
                <View style={[styles.pill, o.delivery_status === "out_for_delivery" ? styles.pillOut : styles.pillAssigned]}>
                  <Text style={styles.pillText}>{o.delivery_status === "out_for_delivery" ? "OUT FOR DELIVERY" : "ASSIGNED"}</Text>
                </View>
              </View>
              <Text style={styles.shop}>{o.customer_name}</Text>
              <View style={styles.addrRow}>
                <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.addr} numberOfLines={2}>{o.customer_address || "No address on file"}</Text>
              </View>
              <View style={styles.cardFoot}>
                <Text style={styles.meta}>{o.sku_count} items • {formatINRFull(o.total)}</Text>
                <Text style={[styles.pay, { color: o.payment_method === "cash" ? colors.warning : colors.success }]}>
                  {o.payment_method === "cash" ? `COLLECT ${formatINRFull(o.total)}` : "ON CREDIT"}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { padding: 18, paddingTop: 20, paddingBottom: 18, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  hi: { color: "#FFF", fontSize: 20, fontWeight: "800" },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 3 },
  statRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  stat: { flex: 1, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 12, padding: 10, alignItems: "center" },
  statVal: { color: "#FFF", fontSize: 22, fontWeight: "800" },
  statLabel: { color: "rgba(255,255,255,0.9)", fontSize: 11, marginTop: 2, fontWeight: "600" },
  card: { backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  code: { fontWeight: "800", color: colors.textSecondary, fontSize: 12 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pillAssigned: { backgroundColor: colors.infoBg },
  pillOut: { backgroundColor: colors.warningBg },
  pillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3, color: colors.text },
  shop: { fontWeight: "800", color: colors.text, fontSize: 16, marginTop: 6 },
  addrRow: { flexDirection: "row", gap: 5, marginTop: 6, alignItems: "flex-start" },
  addr: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  cardFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  meta: { color: colors.textSecondary, fontSize: 12.5, fontWeight: "600" },
  pay: { fontSize: 12, fontWeight: "800" },
  empty: { alignItems: "center", marginTop: 60, gap: 10, paddingHorizontal: 30 },
  emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: "center" },
});
