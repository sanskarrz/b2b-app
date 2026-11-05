// Returns: only orders the pharmacy has RECEIVED. Pick an order → choose products & qty to return,
// confirm Sellable (fully paid) / Issue (part / unpaid), add category + photos / voice → query ticket.
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TextInput, TouchableOpacity, Modal, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useCallback, useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { IssueForm, IssueValue, emptyIssue, issuePayload } from "@/src/components/IssueForm";
import { colors, radius, formatINRFull } from "@/src/theme";

const STATE: Record<string, { l: string; bg: string; fg: string }> = {
  paid: { l: "Paid in full", bg: colors.successBg, fg: colors.success },
  partial: { l: "Part paid", bg: colors.warningBg, fg: colors.warning },
  unpaid: { l: "Unpaid", bg: colors.dangerBg, fg: colors.danger },
};

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function Returns() {
  const router = useRouter();
  const params = useLocalSearchParams<{ order_id?: string }>();
  const [tab, setTab] = useState<"orders" | "history">("orders");
  const [dist, setDist] = useState("");
  const [bill, setBill] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [mode, setMode] = useState<"sellable" | "issue">("sellable");
  const [issue, setIssue] = useState<IssueValue>(emptyIssue());
  const [busy, setBusy] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (dist.trim()) qs.set("distributor", dist.trim());
      if (bill.trim()) qs.set("bill", bill.trim());
      setOrders(await api(`/retail/returnable-orders?${qs.toString()}`));
    } catch (e: any) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dist, bill]);
  useEffect(() => { const t = setTimeout(loadOrders, 250); return () => clearTimeout(t); }, [loadOrders]);
  const loadHistory = useCallback(() => { api("/returns").then(setHistory).catch(() => {}); }, []);
  useFocusEffect(loadHistory);

  const start = (o: any) => {
    setOrder(o);
    setQty({});
    setMode(o.suggested_mode);
    setIssue(emptyIssue());
  };

  // Opened from an order's detail screen → jump straight into that order
  useEffect(() => {
    if (autoOpened || !params.order_id || !orders.length) return;
    const o = orders.find((x) => x.order_id === params.order_id);
    if (o) start(o);
    setAutoOpened(true);
  }, [orders, params.order_id, autoOpened]);

  const setLine = (line: number, max: number, v: number) => setQty((q) => ({ ...q, [line]: Math.max(0, Math.min(max, v)) }));
  const picked = order ? order.items.filter((it: any) => (qty[it.line] || 0) > 0) : [];
  const value = picked.reduce((s: number, it: any) => s + (qty[it.line] || 0) * (it.price || 0), 0);

  const submit = async () => {
    if (!picked.length) return showError("Select at least one product and quantity");
    if (!issue.category) return showError("Pick an issue category");
    setBusy(true);
    try {
      const p = issuePayload(issue);
      await api("/retail/returns/flag", {
        method: "POST",
        body: {
          order_id: order.order_id, items: picked.map((it: any) => ({ line: it.line, qty: qty[it.line] })),
          category: p.type, mode, description: p.description,
          photo_file_ids: p.photo_file_ids, audio_file_id: p.audio_file_id, transcript: p.transcript,
        },
      });
      showSuccess("Return raised — distributor notified in Query Management");
      setOrder(null);
      loadOrders();
      loadHistory();
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Returns" subtitle="Return products from orders you received" showBack />
      <View style={styles.tabs}>
        {(["orders", "history"] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)} testID={`returns-tab-${t}`}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === "orders" ? "Received Orders" : `My Returns (${history.length})`}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === "orders" ? (
        <>
          <View style={styles.searchRow}>
            <TextInput style={[styles.input, { flex: 1.2 }]} value={dist} onChangeText={setDist} placeholder="Distributor name" placeholderTextColor={colors.textTertiary} testID="ret-dist" />
            <TextInput style={[styles.input, { flex: 1 }]} value={bill} onChangeText={setBill} placeholder="Bill / order no." placeholderTextColor={colors.textTertiary} autoCapitalize="characters" testID="ret-bill" />
          </View>
          {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : (
            <FlatList
              data={orders}
              keyExtractor={(o) => o.order_id}
              contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }}
              ListEmptyComponent={<Text style={styles.empty}>No received orders match your search.{"\n"}Only delivered orders can be returned.</Text>}
              renderItem={({ item: o }) => {
                const st = STATE[o.payment_state] || STATE.unpaid;
                const left = o.items.reduce((s: number, it: any) => s + it.returnable_qty, 0);
                return (
                  <TouchableOpacity style={[styles.card, !left && { opacity: 0.5 }]} onPress={() => left && start(o)} disabled={!left} testID={`ret-order-${o.order_id}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.billNo}>{o.bill_number}</Text>
                      <Text style={styles.meta}>{o.distributor_name} · Received {fmtDate(o.delivered_at)}</Text>
                      <Text style={styles.meta}>{o.items.length} product{o.items.length > 1 ? "s" : ""} · {left ? `${left} units returnable` : "Fully returned"}</Text>
                      <View style={[styles.pill, { backgroundColor: st.bg }]}><Text style={[styles.pillText, { color: st.fg }]}>{st.l}</Text></View>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Text style={styles.amt}>{formatINRFull(o.total)}</Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
          ListEmptyComponent={<Text style={styles.empty}>No returns yet</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.hist} onPress={() => item.dispute_id && router.push("/disputes")} testID={`ret-hist-${item.id}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={[styles.billNo, { flex: 1 }]} numberOfLines={2}>{item.product_name}</Text>
                <Text style={[styles.status, { color: item.status === "approved" ? colors.success : item.status === "rejected" ? colors.danger : colors.text }]}>{(item.status || "").toUpperCase()}</Text>
              </View>
              <Text style={styles.meta}>{item.distributor_name} · {item.reason}{item.mode ? ` · ${item.mode === "sellable" ? "Sellable" : "Issue"}` : ""}</Text>
              {!!item.bill_numbers?.length && <Text style={styles.meta}>Bill {item.bill_numbers.join(", ")}</Text>}
              <Text style={styles.amt}>{formatINRFull(item.amount)}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={!!order} animationType="slide" onRequestClose={() => setOrder(null)}>
        <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
          <TopBar title="Return products" subtitle={order ? `${order.bill_number} · ${order.distributor_name}` : ""} showBack onBack={() => setOrder(null)} />
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Select products & quantity</Text>
              {order?.items.map((it: any) => {
                const q = qty[it.line] || 0;
                const max = it.returnable_qty;
                return (
                  <View key={it.line} style={[styles.line, q > 0 && styles.lineOn, !max && { opacity: 0.5 }]} testID={`ret-line-${it.line}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lineName}>{it.name}</Text>
                      <Text style={styles.meta}>Received {it.received_qty}{it.returned_qty ? ` · returned ${it.returned_qty}` : ""} · {formatINRFull(it.price)}</Text>
                      {(it.batch || it.expiry) && <Text style={styles.meta}>Batch {it.batch || "—"} · Exp {it.expiry || "—"}</Text>}
                    </View>
                    <View style={styles.stepper}>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => setLine(it.line, max, q - 1)} disabled={!q} testID={`ret-minus-${it.line}`}>
                        <Ionicons name="remove" size={18} color={colors.text} />
                      </TouchableOpacity>
                      <TextInput
                        style={styles.qty} keyboardType="number-pad" value={String(q)} editable={max > 0}
                        onChangeText={(t) => setLine(it.line, max, parseInt(t.replace(/\D/g, "") || "0", 10))} testID={`ret-qty-${it.line}`}
                      />
                      <TouchableOpacity style={styles.stepBtn} onPress={() => setLine(it.line, max, q + 1)} disabled={q >= max} testID={`ret-plus-${it.line}`}>
                        <Ionicons name="add" size={18} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
              {picked.length > 0 && <Text style={styles.total}>Return value: {formatINRFull(value)}</Text>}

              <Text style={[styles.label, { marginTop: 18 }]}>Return type — pre-selected from payment status, please confirm</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                {(["sellable", "issue"] as const).map((m) => (
                  <TouchableOpacity key={m} style={[styles.mode, mode === m && styles.modeOn]} onPress={() => setMode(m)} testID={`mode-${m}`}>
                    <Text style={[styles.modeTitle, mode === m && { color: "#FFF" }]}>{m === "sellable" ? "Sellable" : "Issue"}</Text>
                    <Text style={[styles.modeSub, mode === m && { color: "#FFF" }]}>{m === "sellable" ? "Bill fully paid" : "Part paid / unpaid"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <IssueForm value={issue} onChange={setIssue} hideTitle />
              <View style={{ height: 16 }} />
              <Button title="Submit return" onPress={submit} loading={busy} testID="ret-submit" />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: "transparent" },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
  tabTextOn: { color: colors.text },
  searchRow: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 46, fontSize: 14, color: "#000", backgroundColor: "#FFF", minWidth: 0 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 8 },
  billNo: { fontWeight: "800", color: colors.text, fontSize: 14 },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  pill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 6 },
  pillText: { fontSize: 10.5, fontWeight: "800" },
  amt: { fontWeight: "800", color: colors.text, fontSize: 14 },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 40, lineHeight: 20 },
  hist: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 8, gap: 2 },
  status: { fontSize: 10, fontWeight: "800", color: colors.warning },
  label: { fontSize: 12, fontWeight: "800", color: colors.textSecondary, marginBottom: 8 },
  line: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 8 },
  lineOn: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  lineName: { fontWeight: "800", color: colors.text, fontSize: 13.5 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4 },
  stepBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF" },
  qty: { width: 48, height: 44, textAlign: "center", fontWeight: "800", fontSize: 15, color: "#000", borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: "#FFF" },
  total: { fontWeight: "800", color: colors.text, fontSize: 14, textAlign: "right", marginTop: 4 },
  mode: { flex: 1, padding: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, minHeight: 60 },
  modeOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeTitle: { fontWeight: "800", fontSize: 15, color: colors.text },
  modeSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
});
