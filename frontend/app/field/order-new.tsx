// Field sales — take an order on behalf of a customer (margin + cash discount)
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, TextInput, ScrollView, Modal, Pressable } from "react-native";
import { useState, useCallback, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius, formatINRFull } from "@/src/theme";

const OFFERS = [0, 3, 4, 5];

export default function TakeOrder() {
  const router = useRouter();
  const [step, setStep] = useState<"customer" | "cart">("customer");
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [custQ, setCustQ] = useState("");
  const [prodQ, setProdQ] = useState("");
  const [customer, setCustomer] = useState<any | null>(null);
  const [cart, setCart] = useState<Record<string, { p: any; qty: number }>>({});
  const [pm, setPm] = useState<"credit" | "cash">("credit");
  const [cd, setCd] = useState(0);
  const [offer, setOffer] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [pickProducts, setPickProducts] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([api("/field/customers"), api("/field/products")]);
      setCustomers(c); setProducts(p);
    } catch (e: any) { showError(e?.message || "Could not load", "Load failed"); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filteredCust = customers.filter((c) => !custQ || c.name.toLowerCase().includes(custQ.toLowerCase()));
  const filteredProd = products.filter((p) => !prodQ || p.name.toLowerCase().includes(prodQ.toLowerCase()) || (p.salt || "").toLowerCase().includes(prodQ.toLowerCase()));

  const totals = useMemo(() => {
    let gross = 0, margin = 0;
    Object.values(cart).forEach(({ p, qty }) => { gross += p.ptr * qty; margin += (p.mrp - p.ptr) * qty; });
    const discPct = Math.min(cd + offer, 100);
    const discAmt = gross * discPct / 100;
    return { gross, margin, discPct, discAmt, net: gross - discAmt };
  }, [cart, cd, offer]);

  const setQty = (p: any, delta: number) => {
    setCart((prev) => {
      const cur = prev[p.product_id]?.qty || 0;
      const next = Math.max(0, cur + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[p.product_id];
      else copy[p.product_id] = { p, qty: next };
      return copy;
    });
  };

  const submit = async () => {
    if (!customer || Object.keys(cart).length === 0) { showError("Add a customer and at least one product"); return; }
    setSubmitting(true);
    try {
      const items = Object.values(cart).map(({ p, qty }) => ({ product_id: p.product_id, qty }));
      const r = await api("/field/orders", { method: "POST", body: { customer_id: customer.id, items, payment_method: pm, cash_discount_pct: cd, offer_pct: offer } });
      showSuccess(`Order ${r.order.code} placed${r.order.status === "accepted" ? " & auto-accepted" : ""}`);
      router.back();
    } catch (e: any) { showError(e?.message || "Could not place order", "Failed"); }
    finally { setSubmitting(false); }
  };

  if (loading) {
    return <SafeAreaView style={styles.container} edges={["top"]}><ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => step === "cart" ? setStep("customer") : router.back()} style={styles.backBtn} testID="takeorder-back"><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={styles.topTitle}>{step === "customer" ? "Select Customer" : "Build Order"}</Text>
        <View style={{ width: 36 }} />
      </View>

      {step === "customer" ? (
        <>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={14} color={colors.textSecondary} />
            <TextInput value={custQ} onChangeText={setCustQ} placeholder="Search customer…" placeholderTextColor={colors.textTertiary} style={styles.searchInput} />
          </View>
          <FlatList
            data={filteredCust}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
            ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>No customers found</Text></View>}
            renderItem={({ item: c }) => (
              <TouchableOpacity style={[styles.custRow, c.blacklisted && { opacity: 0.5 }]} disabled={c.blacklisted}
                onPress={() => { setCustomer(c); setStep("cart"); }} testID={`cust-${c.id}`}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{(c.name || "?")[0]?.toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.custName}>{c.name}</Text>
                  <Text style={styles.custMeta}>Credit avail: {formatINRFull(c.credit_available)}{c.blacklisted ? " · BLACKLISTED" : ""}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          />
        </>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 220 }}>
          <View style={styles.custChip}>
            <Ionicons name="business" size={16} color={colors.primary} />
            <Text style={styles.custChipText}>{customer?.name}</Text>
          </View>

          <TouchableOpacity style={styles.addProdBtn} onPress={() => setPickProducts(true)} testID="add-products-btn">
            <Ionicons name="add-circle" size={18} color="#FFF" />
            <Text style={styles.addProdText}>Add products</Text>
          </TouchableOpacity>

          {Object.values(cart).length === 0 ? (
            <Text style={styles.emptyText}>No items yet. Tap "Add products".</Text>
          ) : (
            Object.values(cart).map(({ p, qty }) => (
              <View key={p.product_id} style={styles.lineRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.lineMeta}>{formatINRFull(p.ptr)} · margin {p.margin_pct?.toFixed(0)}%</Text>
                </View>
                <View style={styles.qtyCtl}>
                  <TouchableOpacity onPress={() => setQty(p, -1)} style={styles.qtyBtn}><Ionicons name="remove" size={16} color={colors.text} /></TouchableOpacity>
                  <Text style={styles.qtyNum}>{qty}</Text>
                  <TouchableOpacity onPress={() => setQty(p, 1)} style={styles.qtyBtn}><Ionicons name="add" size={16} color={colors.text} /></TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {/* Payment + CD */}
          <Text style={styles.sectionLabel}>Payment</Text>
          <View style={styles.pmRow}>
            {(["credit", "cash"] as const).map((m) => (
              <TouchableOpacity key={m} style={[styles.pmChip, pm === m && styles.pmChipActive]} onPress={() => setPm(m)}>
                <Text style={[styles.pmText, pm === m && { color: "#FFF" }]}>{m === "credit" ? "On Credit" : "Cash"}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Cash discount</Text>
          <View style={styles.cdRow}>
            <Text style={styles.cdLabel}>CD %</Text>
            <TextInput value={String(cd)} onChangeText={(v) => setCd(parseFloat(v.replace(/[^\d.]/g, "")) || 0)} keyboardType="decimal-pad" style={styles.cdInput} testID="cd-pct-input" />
          </View>
          <View style={styles.offerRow}>
            {OFFERS.map((o) => (
              <TouchableOpacity key={o} style={[styles.offerChip, offer === o && styles.offerChipActive]} onPress={() => setOffer(o)}>
                <Text style={[styles.offerText, offer === o && { color: "#FFF" }]}>{o === 0 ? "No offer" : `+${o}%`}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {step === "cart" && Object.keys(cart).length > 0 && (
        <View style={styles.footer}>
          <View style={styles.footRow}><Text style={styles.footLabel}>Gross</Text><Text style={styles.footVal}>{formatINRFull(totals.gross)}</Text></View>
          <View style={styles.footRow}><Text style={styles.footLabel}>Discount ({totals.discPct.toFixed(1)}%)</Text><Text style={[styles.footVal, { color: colors.danger }]}>-{formatINRFull(totals.discAmt)}</Text></View>
          <View style={styles.footRow}><Text style={[styles.footLabel, { fontWeight: "800", color: colors.text }]}>Net payable</Text><Text style={styles.netVal}>{formatINRFull(totals.net)}</Text></View>
          <View style={styles.footRow}><Text style={[styles.footLabel, { color: colors.success }]}>Est. margin</Text><Text style={[styles.footVal, { color: colors.success }]}>{formatINRFull(totals.margin)}</Text></View>
          <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.5 }]} onPress={submit} disabled={submitting} testID="place-order-btn">
            {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>Place Order</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Product picker */}
      <Modal visible={pickProducts} transparent animationType="slide" onRequestClose={() => setPickProducts(false)}>
        <Pressable style={styles.modalBg} onPress={() => setPickProducts(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={14} color={colors.textSecondary} />
              <TextInput value={prodQ} onChangeText={setProdQ} placeholder="Search product…" placeholderTextColor={colors.textTertiary} style={styles.searchInput} autoFocus />
            </View>
            <FlatList
              data={filteredProd}
              keyExtractor={(p) => p.product_id}
              style={{ maxHeight: 400 }}
              renderItem={({ item: p }) => {
                const qty = cart[p.product_id]?.qty || 0;
                return (
                  <View style={styles.pickRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.lineMeta}>{formatINRFull(p.ptr)} · MRP {formatINRFull(p.mrp)} · {p.margin_pct?.toFixed(0)}% · stock {p.qty_available}</Text>
                    </View>
                    <View style={styles.qtyCtl}>
                      <TouchableOpacity onPress={() => setQty(p, -1)} style={styles.qtyBtn}><Ionicons name="remove" size={15} color={colors.text} /></TouchableOpacity>
                      <Text style={styles.qtyNum}>{qty}</Text>
                      <TouchableOpacity onPress={() => setQty(p, 1)} style={styles.qtyBtn} testID={`add-${p.product_id}`}><Ionicons name="add" size={15} color={colors.text} /></TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
            <TouchableOpacity style={styles.doneBtn} onPress={() => setPickProducts(false)}>
              <Text style={styles.doneText}>Done ({Object.keys(cart).length} items)</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  topTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 12, marginVertical: 8, paddingHorizontal: 10, backgroundColor: colors.surface, borderRadius: 10, height: 40, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  custRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryBg, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontWeight: "800", fontSize: 16 },
  custName: { fontWeight: "800", color: colors.text, fontSize: 15 },
  custMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  custChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primaryBg, borderRadius: 10, padding: 12, marginBottom: 12 },
  custChipText: { fontWeight: "800", color: colors.text, fontSize: 14 },
  addProdBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 10, marginBottom: 12 },
  addProdText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  lineName: { fontWeight: "700", color: colors.text, fontSize: 14 },
  lineMeta: { color: colors.textSecondary, fontSize: 11.5, marginTop: 2 },
  qtyCtl: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  qtyNum: { minWidth: 20, textAlign: "center", fontWeight: "800", color: colors.text, fontSize: 15 },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.4, marginTop: 16, marginBottom: 8 },
  pmRow: { flexDirection: "row", gap: 8 },
  pmChip: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pmChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pmText: { fontWeight: "700", color: colors.textSecondary, fontSize: 13 },
  cdRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  cdLabel: { color: colors.text, fontWeight: "700", fontSize: 13 },
  cdInput: { flex: 1, backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text },
  offerRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  offerChip: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  offerChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  offerText: { fontWeight: "700", color: colors.textSecondary, fontSize: 12 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: colors.border, padding: 14, paddingBottom: 20, gap: 4 },
  footRow: { flexDirection: "row", justifyContent: "space-between" },
  footLabel: { color: colors.textSecondary, fontSize: 13 },
  footVal: { color: colors.text, fontSize: 13, fontWeight: "700" },
  netVal: { color: colors.text, fontSize: 16, fontWeight: "800" },
  submitBtn: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 8 },
  submitText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
  empty: { alignItems: "center", marginTop: 40 },
  emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: "center", marginTop: 10 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bg, padding: 14, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "88%" },
  handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 999, alignSelf: "center", marginBottom: 6 },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  doneBtn: { backgroundColor: colors.primary, paddingVertical: 13, borderRadius: 12, alignItems: "center", marginTop: 10 },
  doneText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
});
