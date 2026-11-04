// In-app notifications — shared by pharmacy (/notifications) and distributor (/d/notifications).
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { useCallback, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius } from "@/src/theme";

const ICONS: Record<string, { icon: any; color: string }> = {
  order: { icon: "cube", color: "#2563EB" },
  payment: { icon: "card", color: "#16A34A" },
  query: { icon: "flag", color: "#DC2626" },
  mapping: { icon: "link", color: "#7C3AED" },
  info: { icon: "notifications", color: "#F08C47" },
};

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

export function NotificationsScreen({ base }: { base: string }) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const r = await api(base);
      setData(r);
      if (r.unread) api(`${base}/read-all`, { method: "POST" }).catch(() => {});
    } catch {
      setData({ items: [], unread: 0 });
    }
  }, [base]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Notifications" subtitle={data ? `${data.unread} new` : undefined} showBack />
      {!data ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data.items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          renderItem={({ item: n }) => {
            const ic = ICONS[n.kind] || ICONS.info;
            return (
              <TouchableOpacity style={[styles.row, !n.read && styles.unread]} onPress={() => n.link && router.push(n.link)} testID={`notif-${n.id}`}>
                <View style={[styles.icon, { backgroundColor: ic.color + "20" }]}>
                  <Ionicons name={ic.icon} size={18} color={ic.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{n.title}</Text>
                  <Text style={styles.body}>{n.body}</Text>
                  <Text style={styles.time}>{ago(n.created_at)}</Text>
                </View>
                {!n.read && <View style={styles.dot} />}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No notifications yet. Order, payment, query and mapping updates will appear here.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: "row", padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 8, gap: 12, alignItems: "flex-start" },
  unread: { backgroundColor: colors.primaryBg + "50", borderColor: colors.primarySoft },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title: { fontWeight: "800", color: colors.text, fontSize: 13 },
  body: { color: colors.text, fontSize: 12, marginTop: 3 },
  time: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
  empty: { alignItems: "center", marginTop: 60, gap: 10, paddingHorizontal: 30 },
  emptyText: { color: colors.textSecondary, textAlign: "center", fontSize: 13 },
});
