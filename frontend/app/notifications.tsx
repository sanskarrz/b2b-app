import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { colors, radius } from "@/src/theme";

const SAMPLES = [
  { icon: "alert-circle", color: "#DC2626", title: "Credit limit warning", body: "You used 92% of ABC Pharma credit.", time: "2h ago" },
  { icon: "checkmark-circle", color: "#16A34A", title: "Order ORD-2342 shipped", body: "Sun Wholesale dispatched 1 SKU.", time: "5h ago" },
  { icon: "time", color: "#F59E0B", title: "Payment due today", body: "INV-12934 to ABC Pharma — ₹42,300.", time: "9h ago" },
  { icon: "gift", color: "#F08C47", title: "New scheme: Pantoprazole 10+1", body: "Save ₹890 ordering this week.", time: "1d ago" },
];

export default function Notifications() {
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Notifications" subtitle={`${SAMPLES.length} updates`} showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        {SAMPLES.map((n, i) => (
          <View key={i} style={styles.row}>
            <View style={[styles.icon, { backgroundColor: n.color + "20" }]}>
              <Ionicons name={n.icon as any} size={18} color={n.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{n.title}</Text>
              <Text style={styles.body}>{n.body}</Text>
              <Text style={styles.time}>{n.time}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  row: {
    flexDirection: "row",
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 8,
    gap: 12,
  },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title: { fontWeight: "800", color: colors.text, fontSize: 13 },
  body: { color: colors.text, fontSize: 12, marginTop: 3 },
  time: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
});
