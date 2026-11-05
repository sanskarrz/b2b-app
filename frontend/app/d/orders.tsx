// Distributor Orders — incoming orders with Accept/Dispatch/Cancel actions
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, FlatList } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { confirm } from "@/src/components/confirm";
import { colors, radius, formatINRFull } from "@/src/theme";

const STATUSES = [
  { key: "all", label: "All" },
  { key: "placed", label: "New" },
  { key: "accepted", label: "Accepted" },
  { key: "dispatched", label: "Dispatched" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

export default function DistributorOrders() {
  const router = useRouter();
  const [tab, setTab] = useState("placed");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab !== "all") params.set("status", tab);
      if (query) params.set("q", query);
      const data = await api(`/distributor/me/orders?${params.toString()}`);
      setOrders(data);
    } catch (e: any) {
      showError(e?.message || "Could not load orders", "Load failed");
    } finally {
      setLoading(false);
    }
  }, [tab, query]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = (orderId: string, action: "accept" | "dispatch" | "deliver" | "cancel") => {
    const titles: any = { accept: "Accept order?", dispatch: "Mark dispatched?", deliver: "Mark delivered?", cancel: "Cancel order?" };
    const msgs: any = { accept: "Customer will be notified.", dispatch: "This signals the order has left your warehouse.", deliver: "Mark as completed.", cancel: "Customer's credit-line will be restored." };
    confirm(titles[action], msgs[action], [
      { text: "No", style: "cancel" },
      {
        text: "Yes",
        style: action === "cancel" ? "destructive" : "default",
        onPress: async () => {
          setActing(orderId);
          try {
            await api(`/distributor/orders/${orderId}/action`, { method: "POST", body: { action } });
            showSuccess(`Order ${action === "accept" ? "accepted" : action === "dispatch" ? "dispatched" : action === "deliver" ? "delivered" : "cancelled"}`);
            await load();
          } catch (e: any) {
            showError(e?.message || "Action failed", "Could not update");
          } finally {
            setActing(null);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item: o }: { item: any }) => {
    const isNew = o.status === "placed";
    const isAccepted = o.status === "accepted";
    const isDispatched = o.status === "dispatched";
    return (
      <View style={styles.card}>
        <TouchableOpacity onPress={() => router.push(`/order/${o.id}`)} testID={`d-order-card-${o.id}`}>
        <View style={styles.cardHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.code}>{o.code}</Text>
            <Text style={styles.customer} numberOfLines={1}>{o.customer_name || "—"}</Text>
          </View>
          <View style={[styles.statusPill, statusColors(o.status)]}>
            <Text style={[styles.statusText, statusColors(o.status, true)]}>{o.status.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{(o.items || []).length} items • {formatINRFull(o.total)}</Text>
          {o.payment_method && <Text style={styles.metaPill}>{o.payment_method === "credit" ? "📑 Credit" : "💵 Cash"}</Text>}
        </View>
        </TouchableOpacity>
        {/* Actions */}
        {(

          <View style={styles.actions}>
            {isNew && (
              <>
                <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary]} onPress={() => act(o.id, "accept")} disabled={acting === o.id}>
                  <Ionicons name="checkmark-circle" size={14} color="#FFF" />
                  <Text style={styles.actionPrimaryText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.actionGhost]} onPress={() => act(o.id, "cancel")} disabled={acting === o.id}>
                  <Text style={styles.actionGhostText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
            {(isNew || isAccepted) && (
              <TouchableOpacity style={[styles.actionBtn, styles.actionAccent]} onPress={() => act(o.id, "dispatch")} disabled={acting === o.id}>
                <Ionicons name="rocket" size={14} color="#FFF" />
                <Text style={styles.actionPrimaryText}>Dispatch</Text>
              </TouchableOpacity>
            )}
            {isDispatched && (
              <TouchableOpacity style={[styles.actionBtn, styles.actionSuccess]} onPress={() => act(o.id, "deliver")} disabled={acting === o.id}>
                <Ionicons name="flag" size={14} color="#FFF" />
                <Text style={styles.actionPrimaryText}>Mark Delivered</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.viewBtn} onPress={() => router.push(`/order/${o.id}`)} testID={`d-order-view-${o.id}`}>
              <Ionicons name="open-outline" size={16} color={colors.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Incoming Orders</Text>
        <Text style={styles.sub}>{orders.length} {tab === "all" ? "total" : tab}</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={14} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search code or customer…"
          placeholderTextColor={colors.textTertiary}
          style={styles.searchInput}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={{ paddingHorizontal: 12 }}>
        {STATUSES.map((s) => (
          <TouchableOpacity key={s.key} style={[styles.tab, tab === s.key && styles.tabActive]} onPress={() => setTab(s.key)}>
            <Text style={[styles.tabText, tab === s.key && styles.tabTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : orders.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="receipt-outline" size={42} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No {tab === "all" ? "" : tab} orders yet</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
        />
      )}
    </SafeAreaView>
  );
}

function statusColors(status: string, textOnly = false) {
  const map: any = {
    placed: { bg: colors.warningBg, fg: colors.warning },
    accepted: { bg: colors.infoBg, fg: colors.info },
    dispatched: { bg: colors.primaryBg, fg: colors.primary },
    delivered: { bg: colors.successBg, fg: colors.success },
    cancelled: { bg: colors.dangerBg, fg: colors.danger },
  };
  const c = map[status] || { bg: colors.surface, fg: colors.textSecondary };
  return textOnly ? { color: c.fg } : { backgroundColor: c.bg };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: 16, paddingBottom: 6 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },

  searchWrap: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 12, marginTop: 4, paddingHorizontal: 10, backgroundColor: colors.surface, borderRadius: 10, height: 38, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontSize: 13 },

  tabsScroll: { marginTop: 10, flexGrow: 0, flexShrink: 0 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, marginRight: 8, backgroundColor: colors.surface },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
  tabTextActive: { color: "#FFF" },

  card: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginBottom: 10 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  code: { fontWeight: "800", color: colors.text, fontSize: 13 },
  customer: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontWeight: "800", fontSize: 9, letterSpacing: 0.5 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  meta: { color: colors.text, fontSize: 12.5, fontWeight: "600" },
  metaPill: { color: colors.text, fontSize: 10.5, fontWeight: "700", backgroundColor: colors.surface, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },

  actions: { flexDirection: "row", gap: 6, marginTop: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  actionPrimary: { backgroundColor: colors.primary, flex: 1 },
  actionAccent: { backgroundColor: colors.accent, flex: 1 },
  actionSuccess: { backgroundColor: colors.success, flex: 1 },
  actionGhost: { borderWidth: 1, borderColor: colors.border },
  actionPrimaryText: { color: "#FFF", fontWeight: "800", fontSize: 12 },
  actionGhostText: { color: colors.textSecondary, fontWeight: "700", fontSize: 12 },
  viewBtn: { width: 44, height: 44, marginLeft: "auto", alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border },

  empty: { alignItems: "center", marginTop: 60, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
});
