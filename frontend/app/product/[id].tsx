import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [distId, setDistId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api(`/products/${id}`)
      .then((d) => {
        setData(d);
        setDistId(d.product.best_distributor_id);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Product" showBack />
        <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const { product, distributors, substitutes } = data;
  const chosen = distributors.find((d: any) => d.id === distId) || distributors[0];

  const onAddToCart = async () => {
    setAdding(true);
    try {
      await api("/cart/items", {
        method: "POST",
        body: { product_id: product.id, distributor_id: chosen.id, qty },
      });
      Alert.alert("Added to cart", `${qty} × ${product.name}`, [
        { text: "Continue Shopping", onPress: () => router.back() },
        { text: "View Cart", onPress: () => router.push("/cart") },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar
        title="Product"
        showBack
        rightIcons={[{ name: "cart-outline", onPress: () => router.push("/cart") }]}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View style={styles.hero}>
          <Text style={{ fontSize: 72 }}>{product.image_emoji}</Text>
        </View>

        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.salt}>{product.salt}</Text>
        <Text style={styles.meta}>
          {product.manufacturer} • {product.pack}
        </Text>

        <View style={styles.priceRow}>
          <View>
            <Text style={styles.label}>Your price (PTR)</Text>
            <Text style={styles.price}>{formatINRFull(product.ptr)}</Text>
            <Text style={styles.mrp}>MRP {formatINRFull(product.mrp)}</Text>
          </View>
          <View style={styles.marginBox}>
            <Text style={styles.marginLabel}>Margin</Text>
            <Text style={styles.marginVal}>{product.margin_pct.toFixed(1)}%</Text>
          </View>
        </View>

        {product.scheme && (
          <View style={styles.schemeCard}>
            <Ionicons name="gift" size={16} color="#92400E" />
            <Text style={styles.schemeText}>Scheme: {product.scheme}</Text>
          </View>
        )}

        <Text style={[styles.sectionTitle, { marginTop: 22 }]}>Choose distributor</Text>
        {distributors.map((d: any) => (
          <TouchableOpacity
            key={d.id}
            style={[styles.distCard, distId === d.id && styles.distCardActive]}
            onPress={() => setDistId(d.id)}
            testID={`pd-dist-${d.id}`}
          >
            <View style={styles.radioOuter}>
              {distId === d.id ? <View style={styles.radioInner} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.distName}>{d.short_name}</Text>
              <Text style={styles.distMeta}>
                ⭐ {d.rating} • {d.delivery_time} • Min {formatINRFull(d.min_order)}
              </Text>
            </View>
            {d.id === product.best_distributor_id && (
              <View style={styles.bestPill}>
                <Text style={styles.bestText}>BEST</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

        {substitutes.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Find substitutes ({substitutes.length})</Text>
            {substitutes.map((s: any) => (
              <TouchableOpacity
                key={s.id}
                style={styles.subCard}
                onPress={() => router.replace(`/product/${s.id}`)}
              >
                <Text style={{ fontSize: 22 }}>{s.image_emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subName}>{s.name}</Text>
                  <Text style={styles.subMeta}>
                    {s.manufacturer} • {formatINRFull(s.ptr)} ({s.margin_pct.toFixed(1)}% margin)
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      {/* Sticky bottom bar */}
      <View style={styles.bottomBar}>
        <View style={styles.qtyBox}>
          <TouchableOpacity onPress={() => setQty(Math.max(1, qty - 1))} style={styles.qtyBtn} testID="qty-minus">
            <Ionicons name="remove" size={18} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.qty}>{qty}</Text>
          <TouchableOpacity onPress={() => setQty(qty + 1)} style={styles.qtyBtn} testID="qty-plus">
            <Ionicons name="add" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={`Add to Cart • ${formatINRFull(product.ptr * qty)}`}
            onPress={onAddToCart}
            loading={adding}
            fullWidth
            testID="add-to-cart-btn"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hero: {
    height: 180,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  name: { fontSize: 22, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  salt: { fontSize: 13, color: colors.textSecondary, marginTop: 4, fontWeight: "600" },
  meta: { fontSize: 12, color: colors.textTertiary, marginTop: 4 },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },
  label: { fontSize: 11, color: colors.textSecondary, fontWeight: "600" },
  price: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.5, marginTop: 2 },
  mrp: { fontSize: 12, color: colors.textTertiary, textDecorationLine: "line-through", marginTop: 2 },
  marginBox: { alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "#DCFCE7", borderRadius: 12 },
  marginLabel: { fontSize: 10, color: "#15803D", fontWeight: "700" },
  marginVal: { fontSize: 18, fontWeight: "800", color: "#15803D", marginTop: 2 },
  schemeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    marginTop: 10,
    backgroundColor: "#FEF3C7",
    borderRadius: radius.md,
  },
  schemeText: { color: "#92400E", fontWeight: "700", fontSize: 13 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text, marginBottom: 10 },
  distCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 8,
    gap: 10,
  },
  distCardActive: { borderColor: colors.text, backgroundColor: colors.surface },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.text },
  distName: { fontWeight: "700", color: colors.text, fontSize: 14 },
  distMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  bestPill: { backgroundColor: colors.text, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  bestText: { color: "#FFF", fontWeight: "800", fontSize: 9, letterSpacing: 0.5 },
  subCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 8,
  },
  subName: { fontWeight: "700", color: colors.text, fontSize: 13 },
  subMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
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
  qtyBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  qtyBtn: { width: 38, height: 44, alignItems: "center", justifyContent: "center" },
  qty: { width: 40, textAlign: "center", fontWeight: "800", fontSize: 16, color: colors.text },
});
