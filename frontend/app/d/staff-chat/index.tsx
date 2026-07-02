// Distributor — Staff chat threads (office ↔ salesman/delivery/manager)
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError } from "@/src/components/Toast";
import { colors, radius } from "@/src/theme";

const ROLE_ICON: any = { manager: "briefcase", field_sales: "walk", delivery: "bicycle" };
const ROLE_LABEL: any = { manager: "Manager", field_sales: "Field Sales", delivery: "Delivery" };

export default function StaffChatThreads() {
  const router = useRouter();
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setThreads(await api("/distributor/me/staff-chat/threads")); }
    catch (e: any) { showError(e?.message || "Could not load", "Load failed"); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="staffchat-back"><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={styles.topTitle}>Team Chat</Text>
        <View style={{ width: 36 }} />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.staff_id}
          contentContainerStyle={{ padding: 12, paddingBottom: 30 }}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="chatbubbles-outline" size={42} color={colors.textTertiary} /><Text style={styles.emptyText}>No team members yet</Text></View>}
          renderItem={({ item: t }) => (
            <TouchableOpacity style={styles.row} onPress={() => router.push(`/d/staff-chat/${t.staff_id}?name=${encodeURIComponent(t.name || "")}`)} testID={`chat-${t.staff_id}`}>
              <View style={styles.avatar}><Ionicons name={ROLE_ICON[t.role] || "person"} size={18} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{t.name}</Text>
                <Text style={styles.last} numberOfLines={1}>{t.last_text || ROLE_LABEL[t.role]}</Text>
              </View>
              {t.unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{t.unread}</Text></View>}
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
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
  topTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryBg, alignItems: "center", justifyContent: "center" },
  name: { fontWeight: "800", color: colors.text, fontSize: 15 },
  last: { color: colors.textSecondary, fontSize: 12.5, marginTop: 2 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  badgeText: { color: "#FFF", fontWeight: "800", fontSize: 11 },
  empty: { alignItems: "center", marginTop: 50, gap: 8 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
});
