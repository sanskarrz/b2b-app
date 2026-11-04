import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, Linking, Platform, RefreshControl } from "react-native";
import { useCallback, useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINR } from "@/src/theme";
import { showError, showSuccess } from "@/src/components/Toast";
import { confirm } from "@/src/components/confirm";

type Tab = "mapped" | "unmapped";

export default function Vendors() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("mapped");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<any>({ items: [], has_location: true });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locBlocked, setLocBlocked] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/retail/distributors?tab=${tab}${query ? `&q=${encodeURIComponent(query)}` : ""}`));
    } catch (e: any) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tab, query]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const useMyLocation = async () => {
    setLocBusy(true);
    try {
      const cur = await Location.getForegroundPermissionsAsync();
      let granted = cur.granted;
      if (!granted) {
        if (!cur.canAskAgain && cur.status === "denied") {
          setLocBlocked(true);
          return;
        }
        const r = await Location.requestForegroundPermissionsAsync();
        granted = r.granted;
        if (!granted) {
          setLocBlocked(!r.canAskAgain);
          showError("Location is needed to show the nearest distributors first");
          return;
        }
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let area: string | undefined, city: string | undefined, pincode: string | undefined;
      if (Platform.OS !== "web") {
        try {
          const g = (await Location.reverseGeocodeAsync(pos.coords))[0];
          area = g?.district || g?.subregion || undefined;
          city = g?.city || undefined;
          pincode = g?.postalCode || undefined;
        } catch {}
      }
      await api("/auth/location", { method: "PATCH", body: { lat: pos.coords.latitude, lng: pos.coords.longitude, area, city, pincode } });
      showSuccess("Store location saved");
      load();
    } catch (e: any) {
      showError(e?.message || "Couldn't get your location");
    } finally {
      setLocBusy(false);
    }
  };

  const requestMap = async (d: any) => {
    setBusyId(d.id);
    try {
      await api("/retail/mappings", { method: "POST", body: { distributor_id: d.id } });
      showSuccess(`Mapping request sent to ${d.short_name}`);
      load();
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const unmap = (d: any) => {
    const pending = d.mapping_status === "pending";
    if (!pending && (d.credit_used || 0) > 0) {
      showError(`Clear your outstanding of ₹${Math.round(d.credit_used).toLocaleString("en-IN")} with ${d.short_name} before unmapping.`, "Can't unmap yet");
      return;
    }
    confirm(pending ? "Withdraw request?" : `Unmap ${d.short_name}?`, pending ? "Your mapping request will be cancelled." : "Credit orders with this distributor will stop. You can still place cash / advance orders.", [
      { text: "Cancel", style: "cancel" },
      {
        text: pending ? "Withdraw" : "Unmap",
        style: "destructive",
        onPress: async () => {
          setBusyId(d.id);
          try {
            await api(`/retail/mappings/${d.id}`, { method: "DELETE" });
            showSuccess(pending ? "Request withdrawn" : "Unmapped");
            load();
          } catch (e: any) {
            showError(e.message);
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: any) => {
    const st = item.mapping_status;
    return (
      <TouchableOpacity style={styles.card} onPress={() => router.push(`/distributor/${item.id}`)} testID={`vendor-${item.id}`}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(item.short_name || "?").charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{item.short_name}</Text>
          <View style={styles.metaRow}>
            {!!item.rating && (<><Ionicons name="star" size={11} color="#F59E0B" /><Text style={styles.meta}>{item.rating}</Text><Text style={styles.dot}>•</Text></>)}
            <Text style={styles.meta} numberOfLines={1}>{item.location || "—"}</Text>
            {item.distance_km != null && (<><Text style={styles.dot}>•</Text><Text style={[styles.meta, { color: colors.info, fontWeight: "800" }]}>{item.distance_km} km</Text></>)}
          </View>
          <Text style={[styles.delivery, !item.delivery?.serviceable && { color: colors.danger }]} numberOfLines={1}>
            <Ionicons name="bicycle-outline" size={11} /> {item.delivery?.label}
          </Text>
          {tab === "mapped" && item.credit_limit != null && (
            <Text style={styles.credit}>Credit {formatINR(item.credit_used || 0)} / {formatINR(item.credit_limit)}</Text>
          )}
          {st === "rejected" && <Text style={styles.rejected}>Declined{item.reject_reason ? `: ${item.reject_reason}` : ""} — you can request again</Text>}
        </View>
        {tab === "mapped" ? (
          <TouchableOpacity style={styles.ghostBtn} onPress={() => unmap(item)} disabled={busyId === item.id} testID={`unmap-${item.id}`}>
            {busyId === item.id ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={styles.ghostText}>Unmap</Text>}
          </TouchableOpacity>
        ) : st === "pending" ? (
          <TouchableOpacity style={styles.pendingBtn} onPress={() => unmap(item)} disabled={busyId === item.id} testID={`withdraw-${item.id}`}>
            <Text style={styles.pendingText}>Requested</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.mapBtn} onPress={() => requestMap(item)} disabled={busyId === item.id} testID={`map-${item.id}`}>
            {busyId === item.id ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.mapText}>Map</Text>}
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Distributors" subtitle={tab === "mapped" ? `${data.items.length} mapped` : "Nearest first"} />
      <View style={styles.tabs}>
        {(["mapped", "unmapped"] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)} testID={`vendors-tab-${t}`}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === "mapped" ? "Mapped" : "Unmapped"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search by name or area"
          placeholderTextColor={colors.textTertiary} testID="vendors-search" />
      </View>
      {tab === "unmapped" && (
        <View style={styles.locBar}>
          <Ionicons name="location" size={16} color={colors.info} />
          <Text style={styles.locText}>{data.has_location ? "Sorted by distance from your store" : "Set your store location to see the nearest distributors first"}</Text>
          <TouchableOpacity style={styles.locBtn} onPress={useMyLocation} disabled={locBusy} testID="use-my-location">
            {locBusy ? <ActivityIndicator size="small" color={colors.info} /> : <Text style={styles.locBtnText}>{data.has_location ? "Update" : "Use GPS"}</Text>}
          </TouchableOpacity>
        </View>
      )}
      {locBlocked && (
        <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.settings} testID="loc-open-settings">
          <Text style={styles.settingsText}>Location is blocked — Open Settings to allow it</Text>
        </TouchableOpacity>
      )}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data.items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 160 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="storefront-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyText}>{tab === "mapped" ? "No mapped distributors yet — open Unmapped to send a request" : "No distributors found"}</Text>
            </View>
          }
        />
      )}
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
  searchWrap: { flexDirection: "row", alignItems: "center", margin: 16, marginBottom: 8, backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 14, height: 46, borderWidth: 1, borderColor: colors.border, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: "#000", paddingVertical: 0 },
  locBar: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.infoBg },
  locText: { flex: 1, fontSize: 12, color: colors.text, fontWeight: "600" },
  locBtn: { paddingHorizontal: 12, height: 34, justifyContent: "center", borderRadius: 8, backgroundColor: "#FFF" },
  locBtnText: { color: colors.info, fontWeight: "800", fontSize: 12 },
  settings: { marginHorizontal: 16, marginBottom: 8, minHeight: 32, justifyContent: "center" },
  settingsText: { color: colors.primary, fontWeight: "700", fontSize: 12 },
  card: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 10, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "800", color: colors.text },
  name: { fontSize: 14, fontWeight: "800", color: colors.text },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  meta: { fontSize: 11, color: colors.textSecondary, fontWeight: "600" },
  dot: { color: colors.textTertiary, fontSize: 11 },
  delivery: { fontSize: 11, color: colors.success, fontWeight: "700", marginTop: 4 },
  credit: { fontSize: 11, color: colors.text, fontWeight: "700", marginTop: 3 },
  rejected: { fontSize: 11, color: colors.danger, marginTop: 3 },
  mapBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, height: 38, borderRadius: 10, justifyContent: "center", minWidth: 64, alignItems: "center" },
  mapText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
  pendingBtn: { backgroundColor: colors.warningBg, paddingHorizontal: 12, height: 38, borderRadius: 10, justifyContent: "center" },
  pendingText: { color: "#92400E", fontWeight: "800", fontSize: 12 },
  ghostBtn: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 38, borderRadius: 10, justifyContent: "center", minWidth: 64, alignItems: "center" },
  ghostText: { color: colors.danger, fontWeight: "700", fontSize: 12 },
  empty: { alignItems: "center", marginTop: 50, gap: 10, paddingHorizontal: 30 },
  emptyText: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
});
