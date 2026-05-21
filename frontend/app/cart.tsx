import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function Cart() {
  const router = useRouter();
  const [cart, setCart] = useState<{ items: any[]; total: number; count: number }>({
    items: [],
    total: 0,
    count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);

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

  const updateQty = async (id: string, qty: number) => {
    await api(`/cart/items/${id}`, { method: "PATCH", body: { qty } });
    load();
  };

  const remove = async (id: string) => {
    await api(`/cart/items/${id}`, { method: "DELETE" });
    load();
  };

  const placeOrder = async (distributorId?: string) => {
    setPlacing(true);
    try {
      const path = distributorId ? `/orders?distributor_id=${distributorId}` : "/orders";
      const res: any = await api(path, { method: "POST" });
      Alert.alert(
        "Order placed!",
        `${res.orders.length} order(s) placed successfully.`,
        [
          {
            text: "View Orders",
            onPress: () => router.replace("/(tabs)/orders"),
          },
          {
            text: "Continue shopping",
            style: "cancel",
            onPress: () => load(),
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Cart" showBack />
        <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (cart.items.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Cart" showBack />
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyText}>Your cart is empty</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => router.push("/search")}
            testID="cart-browse"
          >
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
      <TopBar title="Cart" subtitle={`${cart.count} items`} showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {Object.entries(byDist).map(([did, items]) => {
          const dist = items[0].distributor;
          const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
          return (
            <View key={did} style={styles.distGroup}>
              <View style={styles.distHead}>
                <View>
                  <Text style={styles.distName}>{dist.short_name}</Text>
                  <Text style={styles.distMeta}>
                    ⭐ {dist.rating} • {dist.delivery_time}
                  </Text>
                </View>
                <Text style={styles.distTotal}>{formatINRFull(subtotal)}</Text>
              </View>
              {items.map((item) => (
                <View key={item.id} style={styles.row}>
                  <Text style={{ fontSize: 28 }}>{item.product.image_emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pName}>{item.product.name}</Text>
                    <Text style={styles.pMeta}>{item.product.pack}</Text>
                    <Text style={styles.pPrice}>{formatINRFull(item.product.ptr)} / unit</Text>
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
                    <TouchableOpacity onPress={() => remove(item.id)} style={{ marginTop: 6 }}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={styles.placeForDist}
                onPress={() => placeOrder(did)}
                disabled={placing}
                testID={`place-for-${did}`}
              >
                <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                <Text style={styles.placeForDistText}>
                  Place order with {dist.short_name} • {formatINRFull(subtotal)}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={styles.bill}>
          <Text style={styles.billTitle}>Bill Summary</Text>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Subtotal</Text>
            <Text style={styles.billVal}>{formatINRFull(cart.total)}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Delivery</Text>
            <Text style={[styles.billVal, { color: "#16A34A" }]}>FREE</Text>
          </View>
          <View style={[styles.billRow, { paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6 }]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalVal}>{formatINRFull(cart.total)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bbLabel}>Total ({Object.keys(byDist).length} distributors)</Text>
          <Text style={styles.bbValue}>{formatINRFull(cart.total)}</Text>
        </View>
        <Button title="Place ALL Orders" onPress={() => placeOrder()} loading={placing} testID="place-order-btn" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  distGroup: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: 14,
  },
  distHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  distName: { fontWeight: "800", color: colors.text, fontSize: 14 },
  distMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  distTotal: { fontWeight: "800", color: colors.text, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  pName: { fontWeight: "700", color: colors.text, fontSize: 13 },
  pMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  pPrice: { fontSize: 12, color: colors.text, fontWeight: "600", marginTop: 4 },
  qtyCol: { alignItems: "center" },
  qtyBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  qtyBtn: { width: 28, height: 30, alignItems: "center", justifyContent: "center" },
  qty: { width: 28, textAlign: "center", fontWeight: "800", fontSize: 13 },
  placeForDist: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    margin: 10,
    borderRadius: 10,
  },
  placeForDistText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
  bill: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: 4 },
  billTitle: { fontWeight: "800", fontSize: 14, color: colors.text, marginBottom: 10 },
  billRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  billLabel: { color: colors.textSecondary, fontSize: 13 },
  billVal: { fontWeight: "700", color: colors.text, fontSize: 13 },
  totalLabel: { fontWeight: "800", color: colors.text, fontSize: 14 },
  totalVal: { fontWeight: "800", color: colors.text, fontSize: 18 },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 22,
  },
  bbLabel: { color: colors.textSecondary, fontSize: 11 },
  bbValue: { fontWeight: "800", color: colors.text, fontSize: 18 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  emptyText: { color: colors.textSecondary, fontSize: 15 },
  emptyBtn: { backgroundColor: colors.primary, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { color: "#FFF", fontWeight: "700" },
});
