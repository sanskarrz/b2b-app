// Distributor Customers — list of pharmacists buying from us
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, FlatList, Linking } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { api } from "@/src/api";
import { showError } from "@/src/components/Toast";
import { MappingRequests } from "@/src/components/MappingRequests";
import { GradePill } from "@/src/components/Ratings";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function DistributorCustomers() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<"customers" | "requests">(params.tab === "requests" ? "requests" : "customers");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = query ? `?q=${encodeURIComponent(query)}` : "";
      const data = await api(`/distributor/me/customers${qs}`);
      setItems(data);
    } catch (e: any) {
      showError(e?.message || "Could not load customers", "Load failed");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalOutstanding = items.reduce((s, c) => s + (c.outstanding || 0), 0);
  const totalSpent = items.reduce((s, c) => s + (c.total_spent || 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Customers</Text>
        <Text style={styles.sub}>{items.length} pharmacies</Text>
      </View>
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {(["customers", "requests"] as const).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} testID={`cust-tab-${t}`}
            style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: tab === t ? colors.primary : "transparent" }}>
            <Text style={{ fontWeight: "800", color: tab === t ? colors.text : colors.textSecondary }}>{t === "customers" ? "Customers" : "Mapping Requests"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === "requests" && <MappingRequests onChanged={load} />}
      {tab === "customers" && (<>

      <View style={styles.kpiRow}>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>LIFETIME SALES</Text>
          <Text style={[styles.kpiVal, { color: colors.success }]}>{formatINRFull(totalSpent)}</Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>OUTSTANDING</Text>
          <Text style={[styles.kpiVal, { color: colors.danger }]}>{formatINRFull(totalOutstanding)}</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={14} color={colors.textSecondary} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search pharmacy, contact, phone…" placeholderTextColor={colors.textTertiary} style={styles.searchInput} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.user_id}
          renderItem={({ item: c }: any) => (
            <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => router.push(`/d/customer/${c.user_id}`)} testID={`cust-card-${c.user_id}`}>
              <View style={styles.cardHead}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(c.name || "?")[0]?.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.contact} numberOfLines={1}>
                    {c.contact_name ? `${c.contact_name} • ` : ""}{c.phone || c.email}
                  </Text>
                </View>
                {c.overdue_count > 0 && (
                  <View style={styles.overduePill}>
                    <Text style={styles.overdueText}>{c.overdue_count} OVERDUE</Text>
                  </View>
                )}
                <GradePill grade={c.rating?.grade} score={c.rating?.score} />
              </View>

              <View style={styles.metaGrid}>
                <Metric label="Outstanding" value={formatINRFull(c.outstanding)} danger={c.outstanding > 0} />
                <Metric label="Credit left" value={formatINRFull(c.credit_available ?? 0)} />
                <Metric label="Orders" value={String(c.orders)} />
              </View>

              <View style={styles.actionsRow}>
                {c.phone && (
                  <TouchableOpacity style={styles.iconAction} onPress={() => Linking.openURL(`tel:${c.phone}`)}>
                    <Ionicons name="call" size={14} color={colors.primary} />
                    <Text style={styles.iconActionText}>Call</Text>
                  </TouchableOpacity>
                )}
                {c.phone && (
                  <TouchableOpacity style={styles.iconAction} onPress={() => Linking.openURL(`https://wa.me/${c.phone.replace(/\D/g, "")}`)}>
                    <Ionicons name="logo-whatsapp" size={14} color={colors.success} />
                    <Text style={styles.iconActionText}>WhatsApp</Text>
                  </TouchableOpacity>
                )}
                {c.email && (
                  <TouchableOpacity style={styles.iconAction} onPress={() => Linking.openURL(`mailto:${c.email}`)}>
                    <Ionicons name="mail" size={14} color={colors.info} />
                    <Text style={styles.iconActionText}>Email</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={42} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No customers yet</Text>
            </View>
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
        />
      )}
      </>)}
    </SafeAreaView>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, danger && { color: colors.danger }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: 16, paddingBottom: 6 },
  title: { fontSize: 22, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },

  kpiRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, marginTop: 6 },
  kpiBox: { flex: 1, padding: 12, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  kpiLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  kpiVal: { fontSize: 18, fontWeight: "800", marginTop: 4, letterSpacing: -0.3 },

  searchWrap: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 12, marginTop: 10, paddingHorizontal: 10, backgroundColor: colors.surface, borderRadius: 10, height: 38, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontSize: 13 },

  card: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginBottom: 10 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryBg, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontWeight: "800", fontSize: 14 },
  name: { fontWeight: "800", color: colors.text, fontSize: 14 },
  contact: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  overduePill: { backgroundColor: colors.danger, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  overdueText: { color: "#FFF", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

  metaGrid: { flexDirection: "row", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  metric: { flex: 1 },
  metricLabel: { color: colors.textSecondary, fontSize: 9.5, fontWeight: "700", letterSpacing: 0.4 },
  metricValue: { color: colors.text, fontWeight: "800", fontSize: 13, marginTop: 2 },

  actionsRow: { flexDirection: "row", gap: 6, marginTop: 10 },
  iconAction: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, padding: 8, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  iconActionText: { fontSize: 11, color: colors.text, fontWeight: "700" },

  empty: { alignItems: "center", marginTop: 60, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
});
