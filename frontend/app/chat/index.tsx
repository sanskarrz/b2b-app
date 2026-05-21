// Chat threads list (one thread per distributor)
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator,
} from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius } from "@/src/theme";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function ChatList() {
  const router = useRouter();
  const [threads, setThreads] = useState<any[]>([]);
  const [distributors, setDistributors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, d] = await Promise.all([api("/chat/threads"), api("/distributors")]);
      setThreads(t);
      setDistributors(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Distributors without threads — show as "Start chat"
  const haveIds = new Set(threads.map((t) => t.distributor.id));
  const others = distributors.filter((d: any) => !haveIds.has(d.id));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Messages" subtitle={`${threads.length} active conversations`} showBack />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.distributor.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
          ListHeaderComponent={
            threads.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="chatbubble-ellipses-outline" size={42} color={colors.textTertiary} />
                <Text style={styles.emptyText}>No conversations yet</Text>
                <Text style={styles.emptySub}>Tap a distributor below to start chatting</Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            others.length > 0 ? (
              <View style={{ marginTop: 18 }}>
                <Text style={styles.othersTitle}>Other distributors</Text>
                {others.map((d: any) => (
                  <TouchableOpacity
                    key={d.id}
                    style={styles.otherRow}
                    onPress={() => router.push(`/chat/${d.id}`)}
                    testID={`chat-start-${d.id}`}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{d.short_name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.distName}>{d.short_name}</Text>
                      <Text style={styles.distMeta}>⭐ {d.rating} • {d.delivery_time}</Text>
                    </View>
                    <Ionicons name="chatbubble-outline" size={18} color={colors.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.threadRow}
              onPress={() => router.push(`/chat/${item.distributor.id}`)}
              testID={`thread-${item.distributor.id}`}
            >
              <View style={[styles.avatar, item.unread > 0 && { borderColor: colors.primary, borderWidth: 2 }]}>
                <Text style={styles.avatarText}>{item.distributor.short_name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={styles.distName}>{item.distributor.short_name}</Text>
                  <Text style={styles.timeText}>{timeAgo(item.last_message.created_at)}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
                  <Text
                    style={[styles.lastMsg, item.unread > 0 && { color: colors.text, fontWeight: "700" }]}
                    numberOfLines={1}
                  >
                    {item.last_message.sender === "user" ? "You: " : ""}{item.last_message.message}
                  </Text>
                  {item.unread > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{item.unread}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    gap: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primaryBg,
    borderWidth: 1, borderColor: colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: colors.primary, fontWeight: "800", fontSize: 16 },
  distName: { fontWeight: "700", color: colors.text, fontSize: 14 },
  distMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  timeText: { color: colors.textSecondary, fontSize: 10, fontWeight: "600" },
  lastMsg: { color: colors.textSecondary, fontSize: 12, flex: 1 },
  unreadBadge: {
    minWidth: 18, height: 18, paddingHorizontal: 5,
    backgroundColor: colors.primary,
    borderRadius: 9, alignItems: "center", justifyContent: "center",
    marginLeft: 6,
  },
  unreadText: { color: "#FFF", fontSize: 10, fontWeight: "800" },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  emptySub: { color: colors.textSecondary, fontSize: 12 },
  othersTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginBottom: 10 },
  otherRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    gap: 12,
    marginBottom: 8,
  },
});
