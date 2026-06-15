// Distributor Messages — list of customer chat threads
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError } from "@/src/components/Toast";
import { colors, radius } from "@/src/theme";

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function DistributorMessages() {
  const router = useRouter();
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api("/distributor/me/chat/threads");
      setThreads(d);
    } catch (e: any) {
      showError(e?.message || "Could not load messages", "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Messages</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t: any) => t.customer.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="chatbubbles-outline" size={42} color={colors.textTertiary} /><Text style={styles.emptyText}>No conversations yet</Text></View>}
          renderItem={({ item: t }: any) => (
            <TouchableOpacity style={styles.row} onPress={() => router.push(`/d/messages/${t.customer.id}`)}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{(t.customer.name || "?")[0]?.toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={styles.name} numberOfLines={1}>{t.customer.name}</Text>
                  <Text style={styles.time}>{timeAgo(t.last_message.created_at)}</Text>
                </View>
                <Text style={[styles.preview, t.unread > 0 && { color: colors.text, fontWeight: "700" }]} numberOfLines={1}>
                  {t.last_message.sender === "distributor" ? "You: " : ""}{t.last_message.message}
                </Text>
              </View>
              {t.unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{t.unread}</Text></View>}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  title: { fontWeight: "800", color: colors.text, fontSize: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryBg, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontWeight: "800", fontSize: 16 },
  name: { fontWeight: "800", color: colors.text, fontSize: 14, flex: 1 },
  time: { color: colors.textTertiary, fontSize: 11 },
  preview: { color: colors.textSecondary, fontSize: 12.5, marginTop: 3 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: "#FFF", fontWeight: "800", fontSize: 11 },
  empty: { alignItems: "center", marginTop: 60, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
});
