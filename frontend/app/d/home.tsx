// Distributor Home — KPI dashboard with sales chart + pending orders
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useCallback, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/api";
import { showError } from "@/src/components/Toast";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function DistributorHome() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [unread, setUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, threads, nt] = await Promise.all([
        api("/distributor/me/dashboard"),
        api("/distributor/me/chat/threads").catch(() => []),
        api("/distributor/me/notifications").catch(() => ({ unread: 0 })),
      ]);
      setData(d);
      setNotifUnread(nt.unread || 0);
      setUnread((threads || []).reduce((s: number, t: any) => s + (t.unread || 0), 0));
    } catch (e: any) {
      showError(e?.message || "Could not load dashboard", "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const d = data.distributor;
  const maxSales = Math.max(...data.sales_chart.map((s: any) => s.sales || 0), 1);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        {/* Hero */}
        <LinearGradient colors={[colors.primarySoft, colors.primary]} style={styles.hero}>
          <View>
            <Text style={styles.heroLabel}>DISTRIBUTOR DASHBOARD</Text>
            <Text style={styles.heroName}>{d.short_name}</Text>
            <Text style={styles.heroSub}>{d.location} • Rating {d.rating}★</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={() => router.push("/d/notifications")} style={styles.heroSettings} testID="d-notif-bell">
              <Ionicons name="notifications-outline" size={18} color="#FFF" />
              {notifUnread > 0 && <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>{notifUnread > 9 ? "9+" : notifUnread}</Text></View>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/d/messages")} style={styles.heroSettings}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFF" />
              {unread > 0 && <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>{unread}</Text></View>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/d/more")} style={styles.heroSettings}>
              <Ionicons name="settings-outline" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <TouchableOpacity style={styles.quickTile} onPress={() => router.push("/d/collections")}>
            <View style={[styles.quickIcon, { backgroundColor: colors.successBg }]}><Ionicons name="cash" size={18} color={colors.success} /></View>
            <Text style={styles.quickLabel}>Collections</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickTile} onPress={() => router.push("/d/customers")}>
            <View style={[styles.quickIcon, { backgroundColor: colors.primaryBg }]}><Ionicons name="people" size={18} color={colors.primary} /></View>
            <Text style={styles.quickLabel}>Customers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickTile} onPress={() => router.push("/d/messages")}>
            <View style={[styles.quickIcon, { backgroundColor: colors.infoBg }]}><Ionicons name="chatbubbles" size={18} color={colors.info} /></View>
            <Text style={styles.quickLabel}>Messages</Text>
            {unread > 0 && <View style={styles.quickBadge}><Text style={styles.heroBadgeText}>{unread}</Text></View>}
          </TouchableOpacity>
        </View>

        {/* Today's metrics */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpi, { backgroundColor: colors.warningBg }]}>
            <Text style={styles.kpiLabel}>Pending</Text>
            <Text style={[styles.kpiValue, { color: colors.warning }]}>{data.pending_orders}</Text>
            <Text style={styles.kpiSub}>orders waiting</Text>
          </View>
          <View style={[styles.kpi, { backgroundColor: colors.infoBg }]}>
            <Text style={styles.kpiLabel}>Dispatched</Text>
            <Text style={[styles.kpiValue, { color: colors.info }]}>{data.dispatched_orders}</Text>
            <Text style={styles.kpiSub}>in transit</Text>
          </View>
          <View style={[styles.kpi, { backgroundColor: colors.successBg }]}>
            <Text style={styles.kpiLabel}>Delivered today</Text>
            <Text style={[styles.kpiValue, { color: colors.success }]}>{data.delivered_today}</Text>
            <Text style={styles.kpiSub}>completed</Text>
          </View>
        </View>

        {/* Today's sales */}
        <View style={styles.salesCard}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
            <View>
              <Text style={styles.sectionLabel}>TODAY&apos;S SALES</Text>
              <Text style={styles.bigValue}>{formatINRFull(data.today_sales)}</Text>
              <Text style={styles.kpiSub}>{data.today_orders_count} orders</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.sectionLabel}>OUTSTANDING</Text>
              <Text style={[styles.bigValue, { color: colors.danger }]}>{formatINRFull(data.outstanding?.total || 0)}</Text>
              <Text style={styles.kpiSub}>{data.outstanding?.count || 0} invoices</Text>
            </View>
          </View>
        </View>

        {/* Sales chart - last 7 days */}
        <View style={styles.chartCard}>
          <Text style={styles.sectionLabel}>LAST 7 DAYS</Text>
          <View style={styles.chart}>
            {data.sales_chart.map((s: any, i: number) => {
              const h = (s.sales / maxSales) * 90;
              return (
                <View key={i} style={styles.chartBarWrap}>
                  <View style={styles.chartBarBg}>
                    <View style={[styles.chartBar, { height: Math.max(h, 2) }]} />
                  </View>
                  <Text style={styles.chartLabel}>{s.label}</Text>
                  <Text style={styles.chartValue}>{s.orders}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Stock alerts */}
        {(data.low_stock > 0 || data.out_of_stock > 0) && (
          <TouchableOpacity style={styles.stockAlert} onPress={() => router.push({ pathname: "/d/inventory", params: { only: "low" } } as any)}>
            <Ionicons name="warning" size={18} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>Stock alerts</Text>
              <Text style={styles.alertSub}>{data.out_of_stock} out of stock • {data.low_stock} low (≤20 units)</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        )}

        {/* Top customers */}
        {data.top_customers && data.top_customers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Customers</Text>
            {data.top_customers.slice(0, 5).map((c: any) => (
              <TouchableOpacity key={c.user_id} style={styles.custRow} onPress={() => router.push(`/d/customer/${c.user_id}`)}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{(c.shop_name || c.name)[0]?.toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.custName} numberOfLines={1}>{c.shop_name || c.name}</Text>
                  <Text style={styles.custMeta}>{c.orders} orders</Text>
                </View>
                <Text style={styles.custSpend}>{formatINRFull(c.total)}</Text>
                <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", padding: 18, paddingTop: 24, paddingBottom: 22, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  heroName: { color: "#FFF", fontSize: 22, fontWeight: "800", marginTop: 4 },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 4, fontWeight: "600" },
  heroSettings: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroBadge: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 1.5, borderColor: colors.primary },
  heroBadgeText: { color: "#FFF", fontWeight: "800", fontSize: 10 },

  quickRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, marginTop: 12 },
  quickTile: { flex: 1, alignItems: "center", paddingVertical: 12, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 6 },
  quickIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 11.5, fontWeight: "700", color: colors.text },
  quickBadge: { position: "absolute", top: 8, right: 16, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },

  kpiRow: { flexDirection: "row", paddingHorizontal: 12, marginTop: 14, gap: 8 },
  kpi: { flex: 1, padding: 12, borderRadius: radius.md },
  kpiLabel: { fontSize: 10, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.4 },
  kpiValue: { fontSize: 24, fontWeight: "800", marginTop: 4, letterSpacing: -0.5 },
  kpiSub: { fontSize: 10.5, color: colors.textSecondary, marginTop: 2, fontWeight: "500" },

  salesCard: { marginHorizontal: 12, marginTop: 12, padding: 14, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  sectionLabel: { fontSize: 10, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.5 },
  bigValue: { fontSize: 22, fontWeight: "800", color: colors.text, marginTop: 3, letterSpacing: -0.5 },

  chartCard: { marginHorizontal: 12, marginTop: 12, padding: 14, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  chart: { flexDirection: "row", alignItems: "flex-end", marginTop: 10, height: 130, gap: 6, justifyContent: "space-between" },
  chartBarWrap: { flex: 1, alignItems: "center" },
  chartBarBg: { height: 90, justifyContent: "flex-end", alignItems: "center", width: "100%" },
  chartBar: { width: "70%", backgroundColor: colors.primary, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  chartLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: "700", marginTop: 4 },
  chartValue: { fontSize: 9, color: colors.textTertiary },

  stockAlert: { marginHorizontal: 12, marginTop: 12, padding: 12, backgroundColor: colors.dangerBg, borderRadius: radius.md, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.danger + "40" },
  alertTitle: { fontWeight: "800", color: colors.text, fontSize: 13 },
  alertSub: { color: colors.danger, fontWeight: "600", fontSize: 11.5, marginTop: 2 },

  section: { marginTop: 16, marginHorizontal: 12 },
  sectionTitle: { fontWeight: "800", color: colors.text, fontSize: 14, marginBottom: 10 },
  custRow: { flexDirection: "row", alignItems: "center", padding: 10, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 6, gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryBg, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontWeight: "800", fontSize: 14 },
  custName: { fontWeight: "700", color: colors.text, fontSize: 13 },
  custMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  custSpend: { color: colors.text, fontWeight: "800", fontSize: 13 },
});
