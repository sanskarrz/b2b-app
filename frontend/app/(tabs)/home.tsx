import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINR, formatINRFull } from "@/src/theme";

export default function HomeScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [dash, cart] = await Promise.all([api("/dashboard"), api("/cart")]);
      setData(dash);
      setCartCount(cart.count || 0);
    } catch (e: any) {
      console.warn("Dashboard load failed", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar
        rightIcons={[
          { name: "notifications-outline", onPress: () => {}, testID: "home-notif", badge: 3 },
          {
            name: "cart-outline",
            onPress: () => router.push("/cart"),
            testID: "home-cart",
            badge: cartCount,
          },
        ]}
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Search */}
        <TouchableOpacity
          style={styles.searchBox}
          onPress={() => router.push("/search")}
          testID="home-search"
        >
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <Text style={styles.searchText}>Search medicines, salt, brand…</Text>
          <View style={{ flex: 1 }} />
          <Ionicons name="mic-outline" size={18} color={colors.textSecondary} />
          <View style={{ width: 12 }} />
          <Ionicons name="scan-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Top KPIs */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Today&apos;s Orders</Text>
            <Text style={styles.kpiValue}>{formatINR(data.today_orders.total)}</Text>
            <Text style={styles.kpiSub}>{data.today_orders.count} orders placed</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Payment Due Today</Text>
            <Text style={styles.kpiValue}>{formatINR(data.payment_due.amount)}</Text>
            <Text style={styles.kpiSub}>
              {data.payment_due.distributor} • {data.payment_due.due_label}
            </Text>
          </View>
        </View>

        {/* AI Insights */}
        <View style={styles.aiCard}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="sparkles" size={14} color={colors.text} />
              <Text style={styles.aiTitle}>AI Insights</Text>
              <View style={styles.suggBadge}>
                <Text style={styles.suggBadgeText}>Reorder Suggested</Text>
              </View>
            </View>
            <Text style={styles.aiSub}>{data.ai_insights.sku_count} SKUs below minimum level</Text>
            <Text style={styles.aiSub}>Estimated Order Value: {formatINRFull(data.ai_insights.estimated_value)}</Text>
          </View>
          <TouchableOpacity
            style={styles.aiBtn}
            onPress={() => router.push("/shortbook")}
            testID="ai-review-btn"
          >
            <Text style={styles.aiBtnText}>Review & Add</Text>
          </TouchableOpacity>
        </View>

        {/* Delivery Today */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Delivery Today</Text>
          <Text style={styles.sectionMeta}>{data.deliveries.length} Shipments</Text>
        </View>
        {data.deliveries.map((d: any, i: number) => (
          <TouchableOpacity
            key={i}
            style={styles.deliveryCard}
            onPress={() => router.push(`/order/${d.order_id}`)}
          >
            <View style={styles.truckBox}>
              <Ionicons name="cube" size={18} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={styles.deliveryInv}>{d.invoice}</Text>
                <View style={styles.distPill}>
                  <Text style={styles.distPillText}>{d.distributor}</Text>
                </View>
              </View>
              <Text style={styles.deliveryMeta}>
                {d.eta_label} • {d.items} Items
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        ))}

        {/* Action Required */}
        <Text style={[styles.sectionTitle, { marginTop: 22, marginBottom: 10 }]}>Action Required</Text>
        <View style={[styles.alertCard, { backgroundColor: colors.dangerBg, borderColor: "#FCA5A5" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="warning" size={16} color={colors.danger} />
            <Text style={[styles.alertTitle, { color: colors.danger }]}>Credit Risk Warning</Text>
          </View>
          <Text style={styles.alertBody}>
            You have used {data.action_required.credit_warning.used_pct}% of credit with{" "}
            <Text style={{ fontWeight: "700" }}>{data.action_required.credit_warning.distributor}</Text>.{" "}
            {formatINRFull(data.action_required.credit_warning.used)} used of{" "}
            {formatINRFull(data.action_required.credit_warning.limit)} limit. Next order may get rejected.
          </Text>
        </View>

        <View style={[styles.alertCard, { backgroundColor: colors.warningBg, borderColor: "#FCD34D" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="time" size={16} color={colors.warning} />
            <Text style={[styles.alertTitle, { color: colors.warning }]}>Backorder Update</Text>
          </View>
          <Text style={styles.alertBody}>
            {data.action_required.backorder.qty} strips of{" "}
            <Text style={{ fontWeight: "700" }}>{data.action_required.backorder.product}</Text> still pending. ETA:{" "}
            {data.action_required.backorder.eta}
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <TouchableOpacity style={styles.linkBtn}>
              <Text style={styles.linkBtnText}>Keep Backorder</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.linkBtn, { backgroundColor: colors.text }]}>
              <Text style={[styles.linkBtnText, { color: "#FFF" }]}>Switch Distributor</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Profit Opportunities */}
        <Text style={[styles.sectionTitle, { marginTop: 22, marginBottom: 10 }]}>Profit Opportunities</Text>
        {data.profit_opportunities.map((p: any, i: number) => (
          <View key={i} style={styles.profitCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.profitTitle}>{p.title}</Text>
              <Text style={styles.profitSub}>{p.subtitle}</Text>
            </View>
            <View style={styles.profitTag}>
              <Text style={styles.profitTagText}>{p.tag}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
    marginBottom: 16,
  },
  searchText: { color: colors.textSecondary, fontSize: 14 },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  kpiCard: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kpiLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "500" },
  kpiValue: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 4, letterSpacing: -0.5 },
  kpiSub: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
  aiCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 18,
    gap: 10,
  },
  aiTitle: { fontWeight: "700", fontSize: 13, color: colors.text },
  suggBadge: { backgroundColor: "#FEF3C7", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  suggBadgeText: { fontSize: 10, color: "#92400E", fontWeight: "700" },
  aiSub: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  aiBtn: { backgroundColor: colors.text, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  aiBtnText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  sectionMeta: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  deliveryCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 8,
    gap: 10,
  },
  truckBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  deliveryInv: { fontWeight: "800", fontSize: 14, color: colors.text },
  distPill: { backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  distPillText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  deliveryMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  alertCard: {
    padding: 14,
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: 10,
  },
  alertTitle: { fontWeight: "800", fontSize: 13 },
  alertBody: { color: colors.text, fontSize: 13, marginTop: 6, lineHeight: 18 },
  linkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkBtnText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  profitCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 8,
    gap: 10,
  },
  profitTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  profitSub: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  profitTag: { backgroundColor: "#DCFCE7", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  profitTagText: { color: "#15803D", fontWeight: "700", fontSize: 11 },
});
