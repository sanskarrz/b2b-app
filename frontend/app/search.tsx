// Pharmarack-style search: one card per product × distributor, Mapped / Non-Mapped tabs,
// distributor filter, "+" add, and a sticky cart bar.
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Modal, Pressable, ScrollView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { showError } from "@/src/components/Toast";
import { QtyInputAdd } from "@/src/components/QtyInputAdd";
import { useCartLookup, refreshCartLookup } from "@/src/hooks/useCartLookup";
import { colors, radius } from "@/src/theme";

type Tab = "mapped" | "unmapped";
const PAGE = 30;

export default function Search() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("mapped");
  const [distFilter, setDistFilter] = useState<{ id: string; name: string } | null>(null);
  const [pickDist, setPickDist] = useState(false);
  const [data, setData] = useState<any>({ items: [], counts: { mapped: 0, unmapped: 0 }, distributors: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [cart, setCart] = useState<any>({ total: 0, items: [] });
  const [last, setLast] = useState<{ name: string; qty: number } | null>(null);
  const reqId = useRef(0);
  const lookup = useCartLookup();

  const loadCart = useCallback(async () => {
    try {
      setCart(await api("/cart"));
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { loadCart(); }, [loadCart]));

  const fetchPage = useCallback(async (skip: number) => {
    const my = ++reqId.current;
    const qs = `q=${encodeURIComponent(q.trim())}&tab=${tab}&skip=${skip}&limit=${PAGE}${distFilter ? `&distributor_id=${distFilter.id}` : ""}`;
    const r = await api(`/retail/search?${qs}`);
    if (my !== reqId.current) return;
    setData((prev: any) => (skip === 0 ? r : { ...r, items: [...prev.items, ...r.items] }));
  }, [q, tab, distFilter]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setData({ items: [], counts: { mapped: 0, unmapped: 0 }, distributors: [], total: 0 });
      return;
    }
    setLoading(true);
    const t = setTimeout(() => fetchPage(0).catch((e) => showError(e.message)).finally(() => setLoading(false)), 300);
    return () => clearTimeout(t);
  }, [fetchPage, q]);

  const loadMore = async () => {
    if (more || loading || data.items.length >= data.total) return;
    setMore(true);
    try { await fetchPage(data.items.length); } finally { setMore(false); }
  };

  const key = (r: any) => `${r.product_id}::${r.distributor_id}`;
  const entry = (r: any) => lookup.getEntry(r.product_id, r.distributor_id);

  const afterChange = async (r: any, qty: number) => {
    setLast({ name: `${r.name}${r.pack ? ` | ${r.pack}` : ""}`, qty });
    await Promise.all([refreshCartLookup(), loadCart()]);
  };

  const add = async (r: any, qty: number) => {
    setAdding(key(r));
    try {
      await api("/cart/items", { method: "POST", body: { product_id: r.product_id, distributor_id: r.distributor_id, qty } });
      await afterChange(r, qty);
    } catch (e: any) {
      showError(e.message);
    } finally {
      setAdding(null);
    }
  };
  const setQty = async (r: any, qty: number) => {
    const e = entry(r);
    if (!e) return;
    try {
      await api(`/cart/items/${e.item_id}`, { method: "PATCH", body: { qty } });
      await afterChange(r, qty);
    } catch (err: any) {
      showError(err.message);
    }
  };

  const scan = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.5 });
    if (!res.canceled && res.assets?.[0]?.base64) router.push({ pathname: "/scan-result", params: { image: res.assets[0].base64, mode: "medicine" } });
  };

  const renderItem = ({ item: r }: any) => {
    const inCart = entry(r)?.qty || 0;
    return (
      <View style={styles.card} testID={`result-${r.product_id}-${r.distributor_id}`}>
        <View style={styles.cardTop}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push({ pathname: "/compare", params: { pid: r.product_id } })} testID={`compare-${r.product_id}`}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={2}>{r.name}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.text} />
            </View>
          </TouchableOpacity>
          {!!r.scheme && <Text style={styles.scheme}>{r.scheme}</Text>}
        </View>
        <View style={styles.chipRow}>
          <TouchableOpacity style={styles.distChip} onPress={() => router.push(`/distributor/${r.distributor_id}`)}>
            <Text style={styles.distChipText} numberOfLines={1}>{r.distributor_name}</Text>
            <Ionicons name="arrow-forward-circle-outline" size={14} color={colors.info} />
          </TouchableOpacity>
          {!r.mapped && <View style={styles.cashTag}><Text style={styles.cashTagText}>Cash / advance</Text></View>}
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.priceLbl}>PTR: <Text style={styles.priceVal}>₹{r.ptr}</Text></Text>
          <Text style={styles.priceLbl}>MRP: <Text style={styles.priceVal}>₹{r.mrp}</Text></Text>
          <Text style={styles.pack} numberOfLines={1}>{r.pack}</Text>
          <View style={{ flex: 1 }} />
          <Ionicons name="cube-outline" size={13} color={r.qty_available > 0 ? colors.success : colors.danger} />
          <Text style={[styles.stock, { color: r.qty_available > 0 ? colors.success : colors.danger }]}>{r.qty_available}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.margin}>Margin {r.margin_pct}%</Text>
          <Text style={[styles.eta, !r.delivery?.serviceable && { color: colors.danger }]} numberOfLines={2}>
            <Ionicons name="bicycle-outline" size={11} /> {r.delivery?.label}{r.delivery?.updated_label ? ` · ${r.delivery.updated_label}` : ""}
          </Text>
        </View>
        <View style={styles.cardFoot}>
          <Text style={styles.mfr} numberOfLines={1}>{(r.manufacturer || "").toUpperCase()}</Text>
          <QtyInputAdd
            inCartQty={inCart}
            loading={adding === key(r)}
            onAdd={(n) => add(r, n)}
            onInc={() => setQty(r, inCart + 1)}
            onDec={() => setQty(r, inCart - 1)}
            testID={`qty-${r.product_id}-${r.distributor_id}`}
          />
        </View>
      </View>
    );
  };

  const distCount = new Set((cart.items || []).map((i: any) => i.distributor_id)).size;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8} testID="search-back">
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <TextInput style={styles.input} value={q} onChangeText={setQ} autoFocus placeholder="Search medicine"
            placeholderTextColor={colors.textTertiary} testID="search-input" returnKeyType="search" />
          {!!q && (
            <TouchableOpacity onPress={() => setQ("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
          <View style={styles.sep} />
          <TouchableOpacity style={styles.distPick} onPress={() => setPickDist(true)} testID="search-dist-filter">
            <Text style={styles.distPickText} numberOfLines={1}>{distFilter ? distFilter.name : "All Distributor"}</Text>
            <Ionicons name="caret-down" size={12} color={colors.text} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={scan} style={styles.scanBtn} testID="search-scan">
          <Ionicons name="scan-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>
      <View style={styles.tabs}>
        {(["mapped", "unmapped"] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => { setTab(t); setDistFilter(null); }} testID={`search-tab-${t}`}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
              {t === "mapped" ? "Mapped" : "Non-Mapped"}{q.trim().length >= 2 ? ` (${data.counts[t]})` : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading && data.items.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data.items}
          keyExtractor={key}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          contentContainerStyle={{ padding: 12, paddingBottom: cart.items?.length ? 150 : 40 }}
          ListFooterComponent={more ? <ActivityIndicator color={colors.primary} style={{ margin: 16 }} /> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                {q.trim().length < 2 ? "Type at least 2 letters to search" : tab === "mapped" ? "Not available with your mapped distributors — check Non-Mapped" : "No other distributors have this"}
              </Text>
            </View>
          }
        />
      )}

      {!!cart.items?.length && (
        <View style={[styles.cartBar, { bottom: 10 + insets.bottom }]} testID="search-cart-bar">
          {!!last && (
            <View style={styles.lastRow}>
              <Text style={styles.lastText} numberOfLines={1}>Last Added: {last.name}</Text>
              <Text style={styles.lastText}>Qty: {last.qty}</Text>
            </View>
          )}
          <View style={styles.cartRow}>
            <Ionicons name="cart-outline" size={26} color={colors.text} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cartTotal}>₹{Number(cart.total || 0).toFixed(2)}</Text>
              <Text style={styles.cartSub}>{distCount} Distributor{distCount === 1 ? "" : "s"}</Text>
            </View>
            <TouchableOpacity style={styles.viewCart} onPress={() => router.push("/cart")} testID="search-view-cart">
              <Text style={styles.viewCartText}>View Cart</Text>
              <Text style={styles.viewCartSub}>{cart.items.length} items</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={pickDist} transparent animationType="slide" onRequestClose={() => setPickDist(false)}>
        <Pressable style={styles.modalBg} onPress={() => setPickDist(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
            <Text style={styles.sheetTitle}>Filter by distributor</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {[{ id: "", name: "All Distributor" }, ...data.distributors].map((d: any) => (
                <TouchableOpacity key={d.id || "all"} style={styles.opt} onPress={() => { setDistFilter(d.id ? d : null); setPickDist(false); }}>
                  <Text style={styles.optText}>{d.name}</Text>
                  {(distFilter?.id || "") === d.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  searchBox: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceMuted, borderRadius: 14, paddingHorizontal: 10, height: 50, overflow: "hidden" },
  input: { flex: 1, minWidth: 0, fontSize: 15, color: "#000", paddingVertical: 0 },
  sep: { width: 1, height: 24, backgroundColor: colors.borderStrong, marginHorizontal: 4 },
  distPick: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: 104, flexShrink: 0, minHeight: 44 },
  distPickText: { fontSize: 13, fontWeight: "600", color: colors.text, flexShrink: 1 },
  scanBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: "transparent" },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 15, color: colors.textSecondary, fontWeight: "600" },
  tabTextOn: { color: colors.text, fontWeight: "800" },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 12, backgroundColor: "#FFF", overflow: "hidden" },
  cardTop: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { fontSize: 16, fontWeight: "800", color: colors.text, flexShrink: 1 },
  scheme: { color: "#D97706", fontWeight: "800", fontSize: 13 },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, marginTop: 8 },
  distChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.infoBg, paddingHorizontal: 10, height: 30, borderRadius: radius.pill, maxWidth: "70%" },
  distChipText: { color: colors.info, fontWeight: "700", fontSize: 12.5, flexShrink: 1 },
  cashTag: { backgroundColor: colors.warningBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  cashTagText: { fontSize: 10, color: "#92400E", fontWeight: "800" },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, marginTop: 10 },
  priceLbl: { fontSize: 12.5, color: colors.textSecondary },
  priceVal: { color: colors.text, fontWeight: "800", fontSize: 13.5 },
  pack: { fontSize: 12, color: colors.textSecondary, maxWidth: 90 },
  stock: { fontWeight: "800", fontSize: 13 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, marginTop: 6, marginBottom: 10 },
  margin: { fontSize: 11.5, fontWeight: "800", color: colors.success, backgroundColor: colors.successBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  eta: { fontSize: 11.5, color: colors.textSecondary, fontWeight: "600", flex: 1 },
  cardFoot: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  mfr: { flex: 1, fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  empty: { alignItems: "center", marginTop: 60, gap: 10, paddingHorizontal: 30 },
  emptyText: { color: colors.textSecondary, textAlign: "center", fontSize: 13 },
  cartBar: { position: "absolute", left: 12, right: 12, backgroundColor: "#FFF", borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden", elevation: 8, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  lastRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 6 },
  lastText: { color: "#FFF", fontSize: 11.5, fontWeight: "700", flexShrink: 1 },
  cartRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  cartTotal: { fontSize: 18, fontWeight: "800", color: colors.text },
  cartSub: { fontSize: 12, color: colors.textSecondary },
  viewCart: { backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 12, alignItems: "center", minHeight: 48, justifyContent: "center" },
  viewCartText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
  viewCartSub: { color: "#FFF", fontSize: 11, opacity: 0.85 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18 },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginBottom: 10 },
  opt: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
  optText: { fontSize: 14, color: colors.text, fontWeight: "600" },
});
