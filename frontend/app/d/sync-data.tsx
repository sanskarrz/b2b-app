// Browse the masters imported from the distributor's own billing software.
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import { useState, useEffect, useCallback, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { api } from "@/src/api";
import { showError } from "@/src/components/Toast";
import { colors, radius, formatINRFull } from "@/src/theme";

type Kind = "product" | "party" | "ledger";
const TABS: { key: Kind; label: string }[] = [
  { key: "product", label: "Items" },
  { key: "party", label: "Parties" },
  { key: "ledger", label: "Ledger" },
];
const PAGE = 50;

export default function SyncData() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const [kind, setKind] = useState<Kind>((params.type as Kind) || "product");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const reqId = useRef(0);

  const fetchPage = useCallback(async (k: Kind, term: string, skip: number) => {
    const id = ++reqId.current;
    try {
      const r = await api(`/distributor/me/sync/browse?type=${k}&q=${encodeURIComponent(term)}&skip=${skip}&limit=${PAGE}`);
      if (id !== reqId.current) return;
      setTotal(r.total);
      setRows((prev) => (skip === 0 ? r.rows : [...prev, ...r.rows]));
    } catch (e: any) {
      if (id === reqId.current) showError(e?.message || "Could not load data", "Load failed");
    } finally {
      if (id === reqId.current) { setLoading(false); setMore(false); }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => fetchPage(kind, q, 0), 250);
    return () => clearTimeout(t);
  }, [kind, q, fetchPage]);

  const loadMore = () => {
    if (more || loading || rows.length >= total) return;
    setMore(true);
    fetchPage(kind, q, rows.length);
  };

  const renderItem = ({ item }: { item: any }) => {
    if (kind === "product") {
      return (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
            {item.code ? <Text style={styles.code}>#{item.code}</Text> : null}
          </View>
          <Text style={styles.cardSub}>
            {[item.pack, item.company].filter(Boolean).join(" • ") || "—"}
          </Text>
          <View style={styles.statRow}>
            <Stat label="MRP" value={formatINRFull(item.mrp)} />
            <Stat label="PTR" value={formatINRFull(item.rate)} />
            <Stat label="PTS" value={formatINRFull(item.pts)} />
            <Stat label="Stock" value={String(item.stock ?? 0)} highlight={(item.stock ?? 0) <= 0} />
            <Stat label="GP%" value={`${item.gp_pct ?? 0}`} />
          </View>
        </View>
      );
    }
    if (kind === "party") {
      return (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
            {item.code ? <Text style={styles.code}>#{item.code}</Text> : null}
          </View>
          <Text style={styles.cardSub}>
            {[item.area, item.city, item.phone].filter(Boolean).join(" • ") || "—"}
          </Text>
          <View style={styles.statRow}>
            <Stat label="Outstanding" value={formatINRFull(item.balance)} highlight={(item.balance ?? 0) > 0} />
            <Stat label="Limit" value={formatINRFull(item.credit_limit)} />
          </View>
          {item.gstin ? <Text style={styles.meta}>GSTIN {item.gstin}</Text> : null}
        </View>
      );
    }
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.party || "—"}</Text>
          <Text style={styles.code}>{item.date || ""}</Text>
        </View>
        <Text style={styles.cardSub}>{[item.voucher, item.type].filter(Boolean).join(" • ") || "—"}</Text>
        <View style={styles.statRow}>
          <Stat label="Debit" value={formatINRFull(item.debit)} />
          <Stat label="Credit" value={formatINRFull(item.credit)} />
          <Stat label="Amount" value={formatINRFull(item.amount)} />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} testID="syncdata-back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>My System Data</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, kind === t.key && styles.tabActive]}
            onPress={() => { setKind(t.key); setRows([]); }}
            testID={`syncdata-tab-${t.key}`}
          >
            <Text style={[styles.tabText, kind === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={17} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder={kind === "product" ? "Search item, code, company" : kind === "party" ? "Search party, area, phone" : "Search party, bill no"}
          placeholderTextColor={colors.textTertiary}
          testID="syncdata-search"
        />
        {q ? <TouchableOpacity onPress={() => setQ("")}><Ionicons name="close-circle" size={17} color={colors.textSecondary} /></TouchableOpacity> : null}
      </View>

      <Text style={styles.countText}>
        {loading ? "Loading…" : `${total.toLocaleString("en-IN")} record${total === 1 ? "" : "s"}`}
      </Text>

      {loading && rows.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={34} color={colors.textTertiary} />
          <Text style={styles.emptyText}>
            {q ? "No records match your search." : "Nothing imported yet. Go to Data Sync and upload your export."}
          </Text>
          {!q ? (
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.replace("/d/sync")}>
              <Text style={styles.emptyBtnText}>Open Data Sync</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={more ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 14 }} /> : null}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, highlight && { color: colors.danger }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },

  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 12, marginBottom: 10 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: "#FFF" },
  tabActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  tabText: { fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  tabTextActive: { color: colors.primary, fontWeight: "800" },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, paddingHorizontal: 12, backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, height: 44 },
  searchInput: { flex: 1, fontSize: 14, color: colors.text },
  countText: { fontSize: 11.5, color: colors.textSecondary, paddingHorizontal: 14, marginTop: 8, fontWeight: "600" },

  card: { backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardTitle: { flex: 1, fontSize: 13.5, fontWeight: "800", color: colors.text },
  code: { fontSize: 10.5, color: colors.textTertiary, fontWeight: "700" },
  cardSub: { fontSize: 11.5, color: colors.textSecondary, marginTop: 2 },
  meta: { fontSize: 10.5, color: colors.textTertiary, marginTop: 6 },

  statRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 10 },
  stat: {},
  statLabel: { fontSize: 9.5, color: colors.textTertiary, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  statValue: { fontSize: 12.5, color: colors.text, fontWeight: "800", marginTop: 1 },

  empty: { alignItems: "center", paddingTop: 50, paddingHorizontal: 30, gap: 10 },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: "center", lineHeight: 19 },
  emptyBtn: { marginTop: 6, backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10 },
  emptyBtnText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
});
