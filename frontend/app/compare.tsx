// Product-wise comparison (Retalio style): search a product → every distributor
// offering it, ranked by margin, with scheme, stock and delivery estimate.
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, FlatList, ScrollView } from "react-native";
import { useCallback, useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { refreshCartLookup } from "@/src/hooks/useCartLookup";
import { colors, radius } from "@/src/theme";

const SORTS = [
  { key: "margin", label: "Best margin" },
  { key: "ptr", label: "Lowest rate" },
  { key: "delivery", label: "Fastest delivery" },
  { key: "stock", label: "Most stock" },
];

export default function Compare() {
  const params = useLocalSearchParams<{ pid?: string }>();
  const router = useRouter();
  const [pid, setPid] = useState<string | undefined>(params.pid);
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [sort, setSort] = useState("margin");
  const [loading, setLoading] = useState(false);
  const [qty, setQty] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return setSuggest([]);
    const t = setTimeout(() => api(`/products?q=${encodeURIComponent(q.trim())}&limit=15`).then(setSuggest).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    if (!pid) return;
    setLoading(true);
    try {
      const r = await api(`/retail/compare/${pid}?sort=${sort}`);
      setData(r);
      setPicked((p) => p || r.offers[0]?.distributor_id || null);
    } catch (e: any) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, [pid, sort]);
  useEffect(() => { load(); }, [load]);

  const addToCart = async () => {
    const n = parseInt(qty, 10) || 1;
    if (!picked || !pid) return;
    setAdding(true);
    try {
      await api("/cart/items", { method: "POST", body: { product_id: pid, distributor_id: picked, qty: n } });
      await refreshCartLookup();
      showSuccess(`${n} × ${data.product.name} added to cart`);
      setQty("");
    } catch (e: any) {
      showError(e.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Compare" subtitle={data?.product ? `${data.product.name} · ${data.product.pack || ""}` : "Product-wise, by margin"} showBack />
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput style={styles.searchInput} value={q} onChangeText={setQ} placeholder="Search a product to compare"
          placeholderTextColor={colors.textTertiary} testID="compare-search" />
      </View>
      {suggest.length > 0 && (
        <View style={styles.suggest}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 260 }}>
            {suggest.map((p) => (
              <TouchableOpacity key={p.id} style={styles.sugRow} onPress={() => { setPid(p.id); setPicked(null); setQ(""); setSuggest([]); }} testID={`compare-pick-${p.id}`}>
                <Text style={styles.sugName}>{p.name}</Text>
                <Text style={styles.sugMeta}>{p.pack} · {p.manufacturer}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {!pid ? (
        <View style={styles.empty}>
          <Ionicons name="git-compare-outline" size={44} color={colors.textTertiary} />
          <Text style={styles.emptyText}>Search a medicine to see every distributor's rate, scheme, margin and delivery side by side.</Text>
        </View>
      ) : loading && !data ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : data ? (
        <>
          <View style={styles.addRow}>
            <TextInput style={styles.qtyInput} value={qty} onChangeText={(v) => setQty(v.replace(/\D/g, "").slice(0, 4))}
              placeholder="Enter quantity" placeholderTextColor={colors.textTertiary} keyboardType="number-pad" testID="compare-qty" />
            <TouchableOpacity style={[styles.addBtn, (!picked || adding) && { opacity: 0.6 }]} onPress={addToCart} disabled={!picked || adding} testID="compare-add">
              {adding ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="cart-outline" size={18} color="#FFF" /><Text style={styles.addText}>Add to cart</Text></>}
            </TouchableOpacity>
          </View>
          <View style={styles.headRow}>
            <Text style={styles.headTitle}>Compare</Text>
            <View style={styles.countPill}><Text style={styles.countText}>{data.offers.length}</Text></View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts}>
            {SORTS.map((s) => (
              <TouchableOpacity key={s.key} style={[styles.sort, sort === s.key && styles.sortOn]} onPress={() => setSort(s.key)} testID={`sort-${s.key}`}>
                <Text style={[styles.sortText, sort === s.key && { color: "#FFF" }]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <FlatList
            data={data.offers}
            keyExtractor={(o) => o.distributor_id}
            contentContainerStyle={{ paddingBottom: 100 }}
            renderItem={({ item: o, index }) => {
              const on = picked === o.distributor_id;
              return (
                <TouchableOpacity style={[styles.offer, on && styles.offerOn]} onPress={() => setPicked(o.distributor_id)} testID={`offer-${o.distributor_id}`}>
                  <View style={styles.offerTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dName} numberOfLines={1}>{o.distributor_name}{o.distributor_area ? `, ${o.distributor_area}` : ""}</Text>
                      <Text style={[styles.eta, !o.delivery?.serviceable && { color: colors.danger }]}>
                        <Ionicons name="bicycle-outline" size={12} /> {o.delivery?.label}{o.distance_km != null ? ` · ${o.distance_km} km` : ""}
                      </Text>
                      {!o.mapped && <Text style={styles.unmapped}>Not mapped · cash / advance only</Text>}
                    </View>
                    <View style={{ alignItems: "flex-end", maxWidth: "45%" }}>
                      <Text style={[styles.qty, { color: o.qty_available > 0 ? colors.success : colors.danger }]}>Qty {o.qty_available}</Text>
                      {!!o.scheme && <Text style={styles.scheme}><Ionicons name="pricetag-outline" size={11} /> Scheme: {o.scheme}</Text>}
                    </View>
                  </View>
                  <View style={styles.priceBox}>
                    <Text style={styles.mrp}>₹ {o.mrp}</Text>
                    <View style={[styles.marginPill, index === 0 && sort === "margin" && { backgroundColor: colors.success }]}>
                      <Text style={[styles.marginText, index === 0 && sort === "margin" && { color: "#FFF" }]}>MARGIN {o.margin_pct}%</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.ptr}>₹ {o.ptr}</Text>
                      {o.effective_ptr < o.ptr && <Text style={styles.eff}>Net ₹{o.effective_ptr}</Text>}
                    </View>
                  </View>
                  {on && <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={styles.tick} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<Text style={[styles.emptyText, { marginTop: 30 }]}>No distributor stocks this product yet.</Text>}
          />
        </>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 8, backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 14, height: 46, borderWidth: 1, borderColor: colors.border, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: "#000", paddingVertical: 0 },
  suggest: { marginHorizontal: 16, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: "#FFF", marginTop: 4 },
  sugRow: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, minHeight: 48 },
  sugName: { fontWeight: "700", color: colors.text, fontSize: 14 },
  sugMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  empty: { alignItems: "center", marginTop: 60, gap: 12, paddingHorizontal: 40 },
  emptyText: { color: colors.textSecondary, textAlign: "center", fontSize: 13 },
  addRow: { flexDirection: "row", gap: 10, padding: 16, paddingBottom: 8 },
  qtyInput: { width: 130, height: 48, borderWidth: 1.5, borderColor: colors.success, borderRadius: 8, paddingHorizontal: 12, fontSize: 14, color: "#000" },
  addBtn: { flex: 1, height: 48, borderRadius: 8, backgroundColor: colors.success, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  addText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, marginTop: 6 },
  headTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  countPill: { backgroundColor: colors.success, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { color: "#FFF", fontWeight: "800", fontSize: 12 },
  sorts: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  sort: { paddingHorizontal: 12, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, justifyContent: "center" },
  sortOn: { backgroundColor: colors.text, borderColor: colors.text },
  sortText: { fontSize: 12, fontWeight: "700", color: colors.text },
  offer: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  offerOn: { backgroundColor: colors.primaryBg + "60" },
  offerTop: { flexDirection: "row", gap: 10 },
  dName: { fontSize: 15, fontWeight: "700", color: colors.text },
  eta: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  unmapped: { fontSize: 11, color: "#92400E", fontWeight: "700", marginTop: 3 },
  qty: { fontWeight: "700", fontSize: 13 },
  scheme: { color: "#1E3A8A", fontSize: 12, marginTop: 4, textAlign: "right" },
  priceBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginTop: 10, backgroundColor: "#FFF" },
  mrp: { fontSize: 14, color: colors.textSecondary },
  marginPill: { backgroundColor: colors.successBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  marginText: { color: "#15803D", fontWeight: "800", fontSize: 12 },
  ptr: { fontSize: 16, fontWeight: "800", color: colors.text },
  eff: { fontSize: 10.5, color: colors.success, fontWeight: "700" },
  tick: { position: "absolute", right: 6, top: 6 },
});
