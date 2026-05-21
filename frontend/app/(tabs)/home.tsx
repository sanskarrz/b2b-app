import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useEffect, useState, useCallback, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeInUp,
  FadeIn,
} from "react-native-reanimated";
import { api } from "@/src/api";
import { colors, radius, formatINR, formatINRFull } from "@/src/theme";

export default function HomeScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const greetedRef = useRef(false);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const load = async () => {
    try {
      const [dash, cart, user] = await Promise.all([
        api("/dashboard"),
        api("/cart"),
        me ? Promise.resolve(me) : api("/auth/me"),
      ]);
      setData(dash);
      setCartCount(cart.count || 0);
      if (!me) setMe(user);
    } catch (e: any) {
      console.warn("Dashboard load failed", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      greetedRef.current = true;
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
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const userName = (me?.name || "Pharmacist").split(" ")[0];
  const shopName = me?.shop_name || "Your Pharmacy";
  const creditPct = data.action_required.credit_warning.used_pct;
  const creditUsed = data.action_required.credit_warning.used;
  const creditLimit = data.action_required.credit_warning.limit;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO HEADER */}
        <LinearGradient
          colors={["#F6AC85", "#F08C47"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          {/* Decorative blobs */}
          <View style={styles.blobA} />
          <View style={styles.blobB} />

          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroGreeting}>{greeting()},</Text>
              <Text style={styles.heroName} numberOfLines={1}>{userName} 👋</Text>
              <View style={styles.heroShopPill}>
                <Ionicons name="storefront" size={11} color="#FFF" />
                <Text style={styles.heroShopText} numberOfLines={1}>{shopName}</Text>
              </View>
            </View>
            <View style={styles.heroIcons}>
              <TouchableOpacity
                style={styles.heroIconBtn}
                onPress={() => router.push("/notifications")}
                testID="home-notif"
              >
                <Ionicons name="notifications-outline" size={20} color="#FFF" />
                <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>3</Text></View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.heroIconBtn}
                onPress={() => router.push("/cart")}
                testID="home-cart"
              >
                <Ionicons name="cart-outline" size={20} color="#FFF" />
                {cartCount > 0 && (
                  <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>{cartCount > 9 ? "9+" : cartCount}</Text></View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Floating search bar */}
          <TouchableOpacity
            style={styles.searchBox}
            onPress={() => router.push("/search")}
            testID="home-search"
            activeOpacity={0.85}
          >
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <Text style={styles.searchText}>Search medicines, salt, brand…</Text>
            <View style={{ flex: 1 }} />
            <View style={styles.scanInsideSearch}>
              <Ionicons name="scan-outline" size={18} color={colors.primary} />
            </View>
          </TouchableOpacity>
        </LinearGradient>

        <View style={styles.body}>
          {/* QUICK ACTIONS */}
          <Animated.View entering={FadeInUp.delay(50).duration(400)} style={styles.quickActions}>
            <QuickAction icon="scan-outline" label="Scan Rx" color={colors.primary} onPress={() => router.push("/search")} />
            <QuickAction icon="cube-outline" label="Bulk Order" color={colors.accent} onPress={() => router.push("/bulk-order")} />
            <QuickAction icon="list-outline" label="Shortbook" color="#F59E0B" onPress={() => router.push("/shortbook")} />
            <QuickAction icon="return-up-back-outline" label="Returns" color="#0EA5A4" onPress={() => router.push("/returns")} />
          </Animated.View>

          {/* TOP KPIs */}
          <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.kpiRow}>
            <View style={[styles.kpiCard, styles.kpiCardPrimary]}>
              <View style={styles.kpiHead}>
                <View style={[styles.kpiIconBox, { backgroundColor: colors.primaryBg }]}>
                  <Ionicons name="receipt-outline" size={14} color={colors.primary} />
                </View>
                <Text style={styles.kpiLabel}>Today&apos;s Orders</Text>
              </View>
              <Text style={styles.kpiValue}>{formatINR(data.today_orders.total)}</Text>
              <Text style={styles.kpiSub}>{data.today_orders.count} orders placed</Text>
            </View>
            <View style={[styles.kpiCard, styles.kpiCardAccent]}>
              <View style={styles.kpiHead}>
                <View style={[styles.kpiIconBox, { backgroundColor: colors.accentBg }]}>
                  <Ionicons name="wallet-outline" size={14} color={colors.accent} />
                </View>
                <Text style={styles.kpiLabel}>Payment Due</Text>
              </View>
              <Text style={styles.kpiValue}>{formatINR(data.payment_due.amount)}</Text>
              <Text style={styles.kpiSub} numberOfLines={1}>
                {data.payment_due.distributor} • {data.payment_due.due_label}
              </Text>
            </View>
          </Animated.View>

          {/* AI Insights */}
          <Animated.View entering={FadeInUp.delay(150).duration(400)}>
            <LinearGradient
              colors={["#FFF8EC", "#FFE9D8"]}
              style={styles.aiCard}
            >
              <View style={styles.aiIconWrap}>
                <Ionicons name="sparkles" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Text style={styles.aiTitle}>AI Insights</Text>
                  <View style={styles.suggBadge}>
                    <Text style={styles.suggBadgeText}>Reorder Suggested</Text>
                  </View>
                </View>
                <Text style={styles.aiSub}>{data.ai_insights.sku_count} SKUs below minimum level</Text>
                <Text style={styles.aiSub}>Est. value: {formatINRFull(data.ai_insights.estimated_value)}</Text>
              </View>
              <TouchableOpacity
                style={styles.aiBtn}
                onPress={() => router.push("/shortbook")}
                testID="ai-review-btn"
              >
                <Text style={styles.aiBtnText}>Review</Text>
                <Ionicons name="arrow-forward" size={12} color="#FFF" />
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>

          {/* Delivery Today */}
          {data.deliveries.length > 0 && (
            <Animated.View entering={FadeInUp.delay(200).duration(400)}>
              <View style={styles.sectionHead}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="cube" size={16} color={colors.text} />
                  <Text style={styles.sectionTitle}>Delivery Today</Text>
                </View>
                <View style={styles.sectionMetaPill}>
                  <Text style={styles.sectionMetaText}>{data.deliveries.length} Shipments</Text>
                </View>
              </View>
              {data.deliveries.map((d: any, i: number) => (
                <TouchableOpacity
                  key={i}
                  style={styles.deliveryCard}
                  onPress={() => router.push(`/order/${d.order_id}`)}
                >
                  <LinearGradient
                    colors={[colors.accentBg, "#FFFFFF"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.truckBox}
                  >
                    <Ionicons name="cube" size={18} color={colors.accent} />
                  </LinearGradient>
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
            </Animated.View>
          )}

          {/* Action Required */}
          <Animated.View entering={FadeInUp.delay(250).duration(400)}>
            <View style={[styles.sectionHead, { marginTop: 22 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.sectionTitle}>Action Required</Text>
              </View>
            </View>

            {/* Credit Risk Card */}
            <View style={styles.creditCard}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={styles.creditIconBox}>
                  <Ionicons name="warning" size={16} color={colors.danger} />
                </View>
                <Text style={styles.creditTitle}>Credit Risk Warning</Text>
                <View style={{ flex: 1 }} />
                <Text style={styles.creditPctText}>{creditPct}%</Text>
              </View>
              <Text style={styles.creditDistName}>
                {data.action_required.credit_warning.distributor}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(creditPct, 100)}%`,
                      backgroundColor:
                        creditPct >= 85 ? colors.danger : creditPct >= 60 ? colors.warning : colors.success,
                    },
                  ]}
                />
              </View>
              <View style={styles.creditFooter}>
                <Text style={styles.creditFooterText}>
                  {formatINRFull(creditUsed)} used of {formatINRFull(creditLimit)}
                </Text>
                <Text style={[styles.creditFooterText, { color: colors.danger, fontWeight: "700" }]}>
                  {formatINRFull(creditLimit - creditUsed)} left
                </Text>
              </View>
              <TouchableOpacity
                style={styles.creditPayBtn}
                onPress={() => router.push("/(tabs)/payments")}
                testID="credit-pay-btn"
              >
                <Ionicons name="card-outline" size={14} color={colors.primary} />
                <Text style={styles.creditPayBtnText}>Pay Now</Text>
              </TouchableOpacity>
            </View>

            {/* Backorder Card */}
            <View style={styles.backorderCard}>
              <View style={styles.backorderHead}>
                <View style={styles.backorderIconBox}>
                  <Ionicons name="time" size={16} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.backorderTitle}>Backorder Update</Text>
                  <Text style={styles.backorderEta}>ETA: {data.action_required.backorder.eta}</Text>
                </View>
                <View style={styles.backorderQtyPill}>
                  <Text style={styles.backorderQtyText}>{data.action_required.backorder.qty}× strips</Text>
                </View>
              </View>
              <Text style={styles.backorderBody}>
                <Text style={{ fontWeight: "700" }}>{data.action_required.backorder.product}</Text> is still pending. Switch distributors or wait.
              </Text>
              <View style={styles.backorderActions}>
                <TouchableOpacity style={styles.backorderBtnSecondary} testID="backorder-keep" activeOpacity={0.8}>
                  <Ionicons name="hourglass-outline" size={14} color={colors.text} />
                  <Text style={styles.backorderBtnSecondaryText}>Keep Waiting</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.backorderBtnPrimary}
                  onPress={() => router.push("/search")}
                  testID="backorder-switch"
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[colors.primarySoft, colors.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.backorderBtnPrimaryInner}
                  >
                    <Ionicons name="swap-horizontal" size={14} color="#FFF" />
                    <Text style={styles.backorderBtnPrimaryText}>Switch Distributor</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>

          {/* Smart Reorder Banner + Quick Tools (replaces old Profit Opportunities) */}
          <Animated.View entering={FadeIn.delay(300).duration(400)}>
            <View style={[styles.sectionHead, { marginTop: 22 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="sparkles" size={16} color={colors.primary} />
                <Text style={styles.sectionTitle}>Smart Tools</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <ToolCard icon="trending-up" label="Smart Reorder" sub="AI-predicted refills" color={colors.success} onPress={() => router.push("/reorder-predictor")} />
              <ToolCard icon="git-compare" label="Compare" sub="Find best vendor" color={colors.accent} onPress={() => router.push("/compare")} />
              <ToolCard icon="bar-chart" label="Margin Analyzer" sub="Profit by category" color="#7C3AED" onPress={() => router.push("/analytics/margin")} />
              <ToolCard icon="calculator" label="Margin Calc" sub="PTR ↔ MRP" color="#0EA5A4" onPress={() => router.push("/calculator")} />
              <ToolCard icon="bookmark" label="Templates" sub="Recurring carts" color={colors.warning} onPress={() => router.push("/templates")} />
              <ToolCard icon="calendar" label="Cash Flow" sub="60-day calendar" color={colors.primary} onPress={() => router.push("/cash-flow")} />
            </View>
          </Animated.View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToolCard({ icon, label, sub, color, onPress }: any) {
  return (
    <TouchableOpacity style={styles.toolCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.toolIcon, { backgroundColor: color + "18", borderColor: color + "40" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.toolLabel}>{label}</Text>
      <Text style={styles.toolSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

function QuickAction({ icon, label, color, onPress }: { icon: any; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.qaItem} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient
        colors={[color + "25", color + "10"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.qaIcon, { borderColor: color + "40" }]}
      >
        <Ionicons name={icon} size={22} color={color} />
      </LinearGradient>
      <Text style={styles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const SHADOW = Platform.select({
  ios: {
    shadowColor: "#7A4A14",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  android: { elevation: 4 },
  default: {},
});

const SHADOW_SOFT = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  android: { elevation: 2 },
  default: {},
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // HERO
  hero: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 36,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  blobA: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.15)",
    top: -60,
    right: -40,
  },
  blobB: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.1)",
    bottom: -30,
    left: -30,
  },
  heroTop: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  heroGreeting: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "500" },
  heroName: { color: "#FFF", fontSize: 22, fontWeight: "800", letterSpacing: -0.4, marginTop: 1 },
  heroShopPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginTop: 8,
  },
  heroShopText: { color: "#FFF", fontSize: 11, fontWeight: "600", maxWidth: 180 },
  heroIcons: { flexDirection: "row", gap: 8 },
  heroIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#FFF",
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBadgeText: { color: colors.primary, fontSize: 9, fontWeight: "800" },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#FFF",
    gap: 10,
    ...(SHADOW as object),
  },
  searchText: { color: colors.textSecondary, fontSize: 14 },
  scanInsideSearch: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.primaryBg,
    alignItems: "center",
    justifyContent: "center",
  },

  body: { paddingHorizontal: 16, paddingTop: 16 },

  // QUICK ACTIONS
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
    gap: 6,
  },
  qaItem: { flex: 1, alignItems: "center", gap: 6 },
  qaIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  qaLabel: { fontSize: 11, color: colors.text, fontWeight: "600" },

  // KPI
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  kpiCard: {
    flex: 1,
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...(SHADOW_SOFT as object),
  },
  kpiCardPrimary: { borderTopWidth: 3, borderTopColor: colors.primary },
  kpiCardAccent: { borderTopWidth: 3, borderTopColor: colors.accent },
  kpiHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  kpiIconBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
  kpiValue: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 8, letterSpacing: -0.5 },
  kpiSub: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },

  // AI
  aiCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBg,
    marginBottom: 20,
    gap: 12,
  },
  aiIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  aiTitle: { fontWeight: "800", fontSize: 14, color: colors.text },
  suggBadge: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  suggBadgeText: { fontSize: 9, color: "#FFF", fontWeight: "800", letterSpacing: 0.3 },
  aiSub: { fontSize: 11.5, color: colors.textSecondary, marginTop: 3 },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  aiBtnText: { color: "#FFF", fontWeight: "800", fontSize: 12 },

  // Sections
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  sectionMetaPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.surface,
    borderRadius: 999,
  },
  sectionMetaText: { fontSize: 11, color: colors.textSecondary, fontWeight: "700" },

  // Delivery
  deliveryCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginBottom: 8,
    gap: 12,
    ...(SHADOW_SOFT as object),
  },
  truckBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  deliveryInv: { fontWeight: "800", fontSize: 14, color: colors.text },
  distPill: { backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  distPillText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  deliveryMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },

  // Credit Card
  creditCard: {
    padding: 14,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: radius.lg,
    marginBottom: 10,
    ...(SHADOW_SOFT as object),
  },
  creditIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.dangerBg,
    alignItems: "center",
    justifyContent: "center",
  },
  creditTitle: { fontWeight: "800", fontSize: 13, color: colors.danger },
  creditPctText: { fontWeight: "800", fontSize: 18, color: colors.danger },
  creditDistName: { fontSize: 12, color: colors.textSecondary, marginTop: 8, marginBottom: 8, fontWeight: "600" },
  progressTrack: {
    height: 8,
    backgroundColor: colors.dangerBg,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  creditFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  creditFooterText: { fontSize: 11.5, color: colors.textSecondary, fontWeight: "500" },
  creditPayBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  creditPayBtnText: { color: colors.primary, fontWeight: "800", fontSize: 12 },

  // Backorder
  backorderCard: {
    padding: 14,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: radius.lg,
    marginBottom: 10,
    ...(SHADOW_SOFT as object),
  },
  backorderHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  backorderIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.warningBg,
    alignItems: "center",
    justifyContent: "center",
  },
  backorderTitle: { fontWeight: "800", fontSize: 13.5, color: colors.warning },
  backorderEta: { fontSize: 11, color: colors.textSecondary, marginTop: 1, fontWeight: "500" },
  backorderQtyPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.warningBg,
    borderRadius: 999,
  },
  backorderQtyText: { color: "#B45309", fontWeight: "800", fontSize: 11 },
  backorderBody: { color: colors.text, fontSize: 12.5, marginTop: 10, lineHeight: 18 },
  backorderActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  backorderBtnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  backorderBtnSecondaryText: { color: colors.text, fontWeight: "700", fontSize: 12.5 },
  backorderBtnPrimary: {
    flex: 1.2,
    borderRadius: 12,
    overflow: "hidden",
  },
  backorderBtnPrimaryInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
  },
  backorderBtnPrimaryText: { color: "#FFF", fontWeight: "800", fontSize: 12.5 },

  // Profit
  profitCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginBottom: 8,
    gap: 12,
    ...(SHADOW_SOFT as object),
  },
  profitIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.successBg,
    alignItems: "center",
    justifyContent: "center",
  },
  profitTitle: { color: colors.text, fontWeight: "700", fontSize: 13.5 },
  profitSub: { color: colors.textSecondary, fontSize: 11.5, marginTop: 3 },
  profitTag: { backgroundColor: colors.successBg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  profitTagText: { color: "#15803D", fontWeight: "800", fontSize: 11 },

  // Tool cards (Smart Tools grid)
  toolCard: {
    flexBasis: "31%",
    flexGrow: 1,
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFF",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  toolIcon: {
    width: 44, height: 44, borderRadius: 14,
    borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  toolLabel: { fontWeight: "800", color: colors.text, fontSize: 12, textAlign: "center", marginTop: 4 },
  toolSub: { color: colors.textSecondary, fontSize: 10, textAlign: "center" },
});
