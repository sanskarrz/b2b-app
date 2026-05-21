import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { TopBar } from "@/src/components/TopBar";
import { Button } from "@/src/components/Button";
import { confirm, choice } from "@/src/components/confirm";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

type PaymentMethod = "cash" | "credit";

export default function Cart() {
  const router = useRouter();
  const [cart, setCart] = useState<{ items: any[]; total: number; count: number }>({
    items: [],
    total: 0,
    count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState<string | null>(null);
  // Per-distributor payment method choice (default cash)
  const [methods, setMethods] = useState<Record<string, PaymentMethod>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await api("/cart");
      setCart(data);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const setMethodFor = (did: string, m: PaymentMethod) => {
    setMethods((prev) => ({ ...prev, [did]: m }));
  };

  const updateQty = async (id: string, qty: number) => {
    await api(`/cart/items/${id}`, { method: "PATCH", body: { qty } });
    load();
  };

  const remove = async (id: string) => {
    await api(`/cart/items/${id}`, { method: "DELETE" });
    load();
  };

  const placeOrder = async (
    distributorId: string | undefined,
    paymentMethod: PaymentMethod
  ) => {
    const key = distributorId || "all";
    setPlacing(key);
    try {
      const qs: string[] = [`payment_method=${paymentMethod}`];
      if (distributorId) qs.push(`distributor_id=${distributorId}`);
      const path = `/orders?${qs.join("&")}`;
      const res: any = await api(path, { method: "POST" });
      choice(
        "Order placed!",
        `${res.orders.length} order(s) placed via ${paymentMethod === "credit" ? "Credit Line" : "Cash"}.`,
        { text: "View Orders", onPress: () => router.replace("/(tabs)/orders") },
        { text: "Continue shopping", onPress: () => load() }
      );
    } catch (e: any) {
      confirm("Order failed", e.message, [{ text: "OK" }]);
    } finally {
      setPlacing(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Cart" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (cart.items.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Cart" showBack />
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cart-outline" size={48} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>Add medicines to start a new order</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => router.push("/search")}
            testID="cart-browse"
          >
            <Ionicons name="search" size={16} color="#FFF" />
            <Text style={styles.emptyBtnText}>Browse Products</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Group by distributor
  const byDist: Record<string, any[]> = {};
  cart.items.forEach((i) => {
    const did = i.distributor.id;
    if (!byDist[did]) byDist[did] = [];
    byDist[did].push(i);
  });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Cart" subtitle={`${cart.count} items • ${Object.keys(byDist).length} distributors`} showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
        {Object.entries(byDist).map(([did, items]) => {
          const dist = items[0].distributor;
          const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
          const creditAvailable = (dist.credit_limit || 0) - (dist.credit_used || 0);
          const creditOk = subtotal <= creditAvailable;
          const selected = methods[did] || "cash";
          const isPlacing = placing === did;

          return (
            <View key={did} style={styles.distGroup}>
              {/* Distributor header */}
              <View style={styles.distHead}>
                <View style={styles.distHeadLeft}>
                  <View style={styles.distAvatar}>
                    <Text style={styles.distAvatarText}>
                      {dist.short_name?.charAt(0) || "D"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.distName}>{dist.short_name}</Text>
                    <Text style={styles.distMeta}>
                      ⭐ {dist.rating} • {dist.delivery_time}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.distItemCount}>{items.length} item{items.length > 1 ? "s" : ""}</Text>
                  <Text style={styles.distTotal}>{formatINRFull(subtotal)}</Text>
                </View>
              </View>

              {/* Items */}
              {items.map((item) => (
                <View key={item.id} style={styles.row}>
                  <View style={styles.itemThumb}>
                    <Text style={{ fontSize: 26 }}>{item.product.image_emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pName} numberOfLines={1}>{item.product.name}</Text>
                    <Text style={styles.pMeta}>{item.product.pack}</Text>
                    <Text style={styles.pPrice}>{formatINRFull(item.product.ptr)} <Text style={styles.pPriceUnit}>/ unit</Text></Text>
                  </View>
                  <View style={styles.qtyCol}>
                    <View style={styles.qtyBox}>
                      <TouchableOpacity
                        onPress={() => updateQty(item.id, item.qty - 1)}
                        style={styles.qtyBtn}
                        testID={`cart-minus-${item.id}`}
                      >
                        <Ionicons name="remove" size={14} color={colors.text} />
                      </TouchableOpacity>
                      <Text style={styles.qty}>{item.qty}</Text>
                      <TouchableOpacity
                        onPress={() => updateQty(item.id, item.qty + 1)}
                        style={styles.qtyBtn}
                        testID={`cart-plus-${item.id}`}
                      >
                        <Ionicons name="add" size={14} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => remove(item.id)} style={styles.removeBtn}>
                      <Ionicons name="trash-outline" size={14} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Payment Method Selector */}
              <View style={styles.paymentSection}>
                <Text style={styles.paymentLabel}>Payment method</Text>
                <View style={styles.payToggle}>
                  <TouchableOpacity
                    style={[styles.payOpt, selected === "cash" && styles.payOptActive]}
                    onPress={() => setMethodFor(did, "cash")}
                    testID={`pay-cash-${did}`}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="cash-outline"
                      size={16}
                      color={selected === "cash" ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[styles.payOptText, selected === "cash" && styles.payOptTextActive]}>
                      Cash / UPI
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.payOpt,
                      selected === "credit" && styles.payOptActive,
                      !creditOk && selected === "credit" && styles.payOptError,
                    ]}
                    onPress={() => setMethodFor(did, "credit")}
                    testID={`pay-credit-${did}`}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="card-outline"
                      size={16}
                      color={selected === "credit" ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[styles.payOptText, selected === "credit" && styles.payOptTextActive]}>
                      Credit Line
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Credit info bar */}
                {selected === "credit" && (
                  <View style={[styles.creditInfo, !creditOk && styles.creditInfoError]}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={styles.creditInfoLabel}>
                        Credit available with {dist.short_name}
                      </Text>
                      <Text style={[styles.creditInfoVal, !creditOk && { color: colors.danger }]}>
                        {formatINRFull(creditAvailable)}
                      </Text>
                    </View>
                    <View style={styles.creditTrack}>
                      <View
                        style={[
                          styles.creditFill,
                          {
                            width: `${Math.min(((dist.credit_used || 0) / Math.max(dist.credit_limit, 1)) * 100, 100)}%`,
                            backgroundColor:
                              (dist.credit_used / dist.credit_limit) >= 0.85
                                ? colors.danger
                                : (dist.credit_used / dist.credit_limit) >= 0.6
                                ? colors.warning
                                : colors.success,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.creditNote, !creditOk && { color: colors.danger, fontWeight: "700" }]}>
                      {creditOk
                        ? `After this order: ${formatINRFull(creditAvailable - subtotal)} left`
                        : `Insufficient credit • short by ${formatINRFull(subtotal - creditAvailable)}`}
                    </Text>
                  </View>
                )}
              </View>

              {/* Place order for this distributor */}
              <TouchableOpacity
                style={[
                  styles.placeForDist,
                  (isPlacing || (selected === "credit" && !creditOk)) && { opacity: 0.55 },
                ]}
                onPress={() => placeOrder(did, selected)}
                disabled={isPlacing || (selected === "credit" && !creditOk)}
                testID={`place-for-${did}`}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[colors.primarySoft, colors.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.placeForDistInner}
                >
                  {isPlacing ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                      <Text style={styles.placeForDistText}>
                        Place order • {formatINRFull(subtotal)}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Bill Summary */}
        <View style={styles.bill}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Ionicons name="receipt-outline" size={14} color={colors.text} />
            <Text style={styles.billTitle}>Bill Summary</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Subtotal</Text>
            <Text style={styles.billVal}>{formatINRFull(cart.total)}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Delivery</Text>
            <Text style={[styles.billVal, { color: colors.success }]}>FREE</Text>
          </View>
          <View style={[styles.billRow, { paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6 }]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalVal}>{formatINRFull(cart.total)}</Text>
          </View>
          <Text style={styles.billNote}>
            ℹ️ Separate bills will be created per distributor with their respective payment methods.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom bar — Place ALL */}
      <View style={styles.bottomBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bbLabel}>Total ({Object.keys(byDist).length} distributor{Object.keys(byDist).length > 1 ? "s" : ""})</Text>
          <Text style={styles.bbValue}>{formatINRFull(cart.total)}</Text>
        </View>
        <Button
          title={placing === "all" ? "Placing…" : "Place ALL"}
          onPress={() => {
            // Use the per-distributor selected method; fallback cash. If all are credit-feasible use credit when any is credit, else cash.
            // Simpler: if any distributor has selected=credit and is feasible, treat as credit; otherwise cash.
            const anyCredit = Object.entries(methods).some(([did, m]) => {
              if (m !== "credit") return false;
              const items = byDist[did];
              if (!items) return false;
              const dist = items[0].distributor;
              const sub = items.reduce((s, i) => s + i.subtotal, 0);
              return ((dist.credit_limit || 0) - (dist.credit_used || 0)) >= sub;
            });
            placeOrder(undefined, anyCredit ? "credit" : "cash");
          }}
          loading={placing === "all"}
          testID="place-order-btn"
        />
      </View>
    </SafeAreaView>
  );
}

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

  // Distributor group card
  distGroup: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: 16,
    ...(SHADOW_SOFT as object),
  },
  distHead: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  distHeadLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
  distAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primaryBg,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  distAvatarText: { color: colors.primary, fontWeight: "800", fontSize: 14 },
  distName: { fontWeight: "800", color: colors.text, fontSize: 14 },
  distMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  distItemCount: { color: colors.textSecondary, fontSize: 11, marginBottom: 1 },
  distTotal: { fontWeight: "800", color: colors.text, fontSize: 15 },

  // Items
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  pName: { fontWeight: "700", color: colors.text, fontSize: 13.5 },
  pMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  pPrice: { fontSize: 12.5, color: colors.text, fontWeight: "700", marginTop: 4 },
  pPriceUnit: { fontWeight: "500", color: colors.textSecondary, fontSize: 11 },
  qtyCol: { alignItems: "center" },
  qtyBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    backgroundColor: "#FFF",
  },
  qtyBtn: { width: 28, height: 30, alignItems: "center", justifyContent: "center" },
  qty: { width: 28, textAlign: "center", fontWeight: "800", fontSize: 13 },
  removeBtn: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },

  // Payment section
  paymentSection: { padding: 12, paddingBottom: 0 },
  paymentLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  payToggle: {
    flexDirection: "row",
    gap: 8,
  },
  payOpt: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: "#FFF",
  },
  payOptActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  payOptError: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  payOptText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12.5 },
  payOptTextActive: { color: colors.primary, fontWeight: "800" },

  creditInfo: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  creditInfoError: { backgroundColor: colors.dangerBg, borderColor: "#FCA5A5" },
  creditInfoLabel: { fontSize: 11.5, color: colors.textSecondary, fontWeight: "600" },
  creditInfoVal: { fontSize: 13, color: colors.text, fontWeight: "800" },
  creditTrack: { height: 6, backgroundColor: colors.bg, borderRadius: 999, overflow: "hidden" },
  creditFill: { height: "100%", borderRadius: 999 },
  creditNote: { fontSize: 11, color: colors.textSecondary, marginTop: 6 },

  // Place btn
  placeForDist: {
    margin: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  placeForDistInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  placeForDistText: { color: "#FFF", fontWeight: "800", fontSize: 13.5 },

  // Bill summary
  bill: {
    padding: 14,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginTop: 4,
    ...(SHADOW_SOFT as object),
  },
  billTitle: { fontWeight: "800", fontSize: 14, color: colors.text },
  billRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  billLabel: { color: colors.textSecondary, fontSize: 13 },
  billVal: { fontWeight: "700", color: colors.text, fontSize: 13 },
  totalLabel: { fontWeight: "800", color: colors.text, fontSize: 14 },
  totalVal: { fontWeight: "800", color: colors.text, fontSize: 20 },
  billNote: {
    marginTop: 10,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    fontStyle: "italic",
  },

  // Bottom bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 22,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        }
      : { elevation: 8 }),
  },
  bbLabel: { color: colors.textSecondary, fontSize: 11 },
  bbValue: { fontWeight: "800", color: colors.text, fontSize: 18 },

  // Empty
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 30 },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: colors.primaryBg,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  emptySub: { color: colors.textSecondary, fontSize: 13, textAlign: "center", marginTop: -8 },
  emptyBtn: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: "#FFF", fontWeight: "800" },
});
