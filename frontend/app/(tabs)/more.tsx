import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api, clearToken } from "@/src/api";
import { colors, radius } from "@/src/theme";
import { confirm } from "@/src/components/confirm";

type ItemDef = {
  icon: any;
  label: string;
  onPress: () => void;
  testID?: string;
  badge?: string;
};

export default function More() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    api("/auth/me")
      .then(setUser)
      .catch(() => {});
  }, []);

  const onLogout = () => {
    confirm("Log out?", "You will need to sign in again with OTP.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await clearToken();
          router.replace("/auth/email");
        },
      },
    ]);
  };

  const sections: { title: string; items: ItemDef[] }[] = [
    {
      title: "Operations",
      items: [
        { icon: "chatbubbles-outline", label: "Messages (Distributor Chat)", onPress: () => router.push("/chat"), testID: "more-chat" },
        { icon: "calendar-outline", label: "Cash Flow Calendar", onPress: () => router.push("/cash-flow"), testID: "more-cashflow" },
        { icon: "bookmark-outline", label: "Order Templates", onPress: () => router.push("/templates"), testID: "more-templates" },
        { icon: "heart-outline", label: "Favourites & Watchlist", onPress: () => router.push("/favourites"), testID: "more-favs" },
        { icon: "document-text-outline", label: "Credit / Debit Notes", onPress: () => router.push("/credit-note/new"), testID: "more-cn" },
        { icon: "list-outline", label: "Shortbook (Auto-reorder)", onPress: () => router.push("/shortbook"), testID: "more-shortbook" },
        { icon: "return-up-back-outline", label: "Returns & Refunds", onPress: () => router.push("/returns"), testID: "more-returns" },
        { icon: "cube-outline", label: "Bulk Order", onPress: () => router.push("/bulk-order"), testID: "more-bulk" },
      ],
    },
    {
      title: "Reports & Insights",
      items: [
        { icon: "stats-chart-outline", label: "Sales Analytics", onPress: () => router.push("/reports/analytics"), testID: "more-analytics" },
        { icon: "document-text-outline", label: "GST Invoices", onPress: () => router.push("/reports/gst-invoices"), testID: "more-gst" },
        { icon: "trending-up-outline", label: "Profit Report", onPress: () => router.push("/reports/profit"), testID: "more-profit" },
      ],
    },
    {
      title: "Account",
      items: [
        { icon: "person-outline", label: "Profile & Shop Info", onPress: () => router.push("/profile"), testID: "more-profile" },
        { icon: "flag-outline", label: "Report a problem", onPress: () => router.push("/report-issue"), testID: "more-report" },
        { icon: "notifications-outline", label: "Notifications", onPress: () => router.push("/notifications"), testID: "more-notifications" },
        { icon: "help-circle-outline", label: "Help & Support", onPress: () => router.push("/help"), testID: "more-help" },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="More" />
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        {user && (
          <View style={styles.profile}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user.name || user.email || "U").charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user.name || "Welcome"}</Text>
              <Text style={styles.sub}>{user.shop_name || user.email}</Text>
              <Text style={styles.sub}>{user.phone}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </View>
        )}

        {sections.map((sec, i) => (
          <View key={i} style={{ marginTop: 18 }}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            <View style={styles.group}>
              {sec.items.map((item, j) => (
                <TouchableOpacity
                  key={j}
                  style={[styles.row, j === sec.items.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={item.onPress}
                  testID={item.testID}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name={item.icon} size={18} color={colors.text} />
                  </View>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <View style={{ flex: 1 }} />
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.logout} onPress={onLogout} testID="logout-btn">
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
        <Text style={styles.version}>RX Tech v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    margin: 16,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFF", fontSize: 22, fontWeight: "800" },
  name: { fontWeight: "800", fontSize: 16, color: colors.text },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  sectionTitle: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "700",
    letterSpacing: 1,
    paddingHorizontal: 22,
    marginBottom: 6,
  },
  group: {
    marginHorizontal: 16,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 14, color: colors.text, fontWeight: "600" },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 24,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutText: { color: colors.danger, fontWeight: "700", fontSize: 14 },
  version: { textAlign: "center", marginTop: 16, color: colors.textTertiary, fontSize: 11 },
});
