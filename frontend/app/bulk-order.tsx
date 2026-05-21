import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function BulkOrder() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [qty, setQty] = useState("100");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (!search.trim()) {
      setProducts([]);
      return;
    }
    const t = setTimeout(async () => {
      const data = await api(`/products?q=${encodeURIComponent(search)}`);
      setProducts(data);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const choose = async (p: any) => {
    setSelected(p);
    setLoading(true);
    try {
      const d = await api(`/products/${p.id}`);
      setData(d);
    } finally {
      setLoading(false);
    }
  };

  const addBulk = async (distId: string) => {
    const q = parseInt(qty || "0", 10);
    if (!q || q <= 0) {
      Alert.alert("Invalid quantity", "Enter a positive bulk quantity");
      return;
    }
    setAdding(distId);
    try {
      await api("/cart/items", {
        method: "POST",
        body: { product_id: selected.id, distributor_id: distId, qty: q },
      });
      Alert.alert(
        "Bulk added",
        `${q} × ${selected.name} added from ${data.distributors.find((d: any) => d.id === distId)?.short_name}`,
        [
          { text: "Add another", style: "cancel" },
          { text: "View Cart", onPress: () => router.push("/cart") },
        ]
      );
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setAdding(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Bulk Order" subtitle="Order one SKU in bulk from any distributor" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Product picker */}
          <Text style={styles.label}>1. Choose product</Text>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={(t) => {
                setSearch(t);
                setSelected(null);
                setData(null);
              }}
              placeholder="Search by name / salt / brand"
              placeholderTextColor={colors.textTertiary}
              testID="bulk-search-input"
            />
          </View>

          {!selected && products.length > 0 && (
            <View style={{ marginTop: 8 }}>
              {products.slice(0, 6).map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.pCard}
                  onPress={() => choose(p)}
                  testID={`bulk-product-${p.id}`}
                >
                  <Text style={{ fontSize: 22 }}>{p.image_emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pName}>{p.name}</Text>
                    <Text style={styles.pMeta}>
                      {p.manufacturer} • {p.pack}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {selected && (
            <View style={styles.selectedCard}>
              <Text style={{ fontSize: 28 }}>{selected.image_emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.selName}>{selected.name}</Text>
                <Text style={styles.selMeta}>
                  {selected.manufacturer} • {selected.pack}
                </Text>
              </View>
              <TouchableOpacity onPress={() => { setSelected(null); setData(null); setSearch(""); }}>
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {selected && (
            <>
              <Text style={[styles.label, { marginTop: 18 }]}>2. Bulk quantity</Text>
              <View style={styles.qtyInputBox}>
                <Text style={{ color: colors.textSecondary, fontSize: 14, marginRight: 8 }}>Units:</Text>
                <TextInput
                  style={styles.qtyInput}
                  value={qty}
                  onChangeText={(v) => setQty(v.replace(/\D/g, ""))}
                  keyboardType="number-pad"
                  testID="bulk-qty"
                />
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {[50, 100, 200, 500].map((n) => (
                    <TouchableOpacity
                      key={n}
                      style={styles.presetChip}
                      onPress={() => setQty(String(n))}
                    >
                      <Text style={styles.presetText}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Text style={[styles.label, { marginTop: 18 }]}>3. Compare distributors & order</Text>
              {loading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
              ) : data ? (
                data.distributors.map((d: any) => {
                  const lineTotal = data.product.ptr * parseInt(qty || "0", 10);
                  const isBest = d.id === data.product.best_distributor_id;
                  return (
                    <View key={d.id} style={[styles.distRow, isBest && styles.distRowBest]}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={styles.distName}>{d.short_name}</Text>
                          {isBest && (
                            <View style={styles.bestPill}>
                              <Text style={styles.bestText}>BEST</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.distMeta}>
                          ⭐ {d.rating} • {d.delivery_time}
                        </Text>
                        <Text style={styles.distPrice}>
                          {formatINRFull(data.product.ptr)}/unit • Total{" "}
                          <Text style={{ fontWeight: "800", color: colors.text }}>
                            {formatINRFull(lineTotal)}
                          </Text>
                        </Text>
                      </View>
                      <Button
                        title={adding === d.id ? "..." : "Add"}
                        onPress={() => addBulk(d.id)}
                        small
                        loading={adding === d.id}
                        testID={`bulk-add-${d.id}`}
                      />
                    </View>
                  );
                })
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  label: { fontWeight: "700", fontSize: 13, color: colors.text, marginBottom: 8 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 0 },
  pCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: 8,
    gap: 12,
  },
  pName: { fontWeight: "700", color: colors.text, fontSize: 13 },
  pMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    marginTop: 10,
    gap: 12,
    backgroundColor: colors.surface,
  },
  selName: { fontWeight: "800", color: colors.text, fontSize: 15 },
  selMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  qtyInputBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    gap: 6,
    backgroundColor: colors.bg,
  },
  qtyInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  presetChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetText: { fontSize: 12, fontWeight: "700", color: colors.text },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 8,
    gap: 10,
  },
  distRowBest: { borderColor: colors.primary, backgroundColor: colors.surface },
  distName: { fontWeight: "700", color: colors.text, fontSize: 14 },
  distMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 3 },
  distPrice: { fontSize: 12, color: colors.text, marginTop: 6 },
  bestPill: { backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  bestText: { color: "#FFF", fontWeight: "800", fontSize: 9, letterSpacing: 0.5 },
});
