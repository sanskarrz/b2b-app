// Entry screen — two completely separate login portals: Pharmacy and Distributor.
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, radius } from "@/src/theme";

export default function ChoosePortal() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.logo}>
          <Text style={styles.logoR}>R</Text>
          <Text style={styles.logoX}>X</Text>
        </View>
        <Text style={styles.brand}>RX Tech</Text>
        <Text style={styles.tag}>B2B Pharma Marketplace</Text>

        <Text style={styles.prompt}>How do you want to continue?</Text>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/auth/email?portal=pharmacy")}
          testID="portal-pharmacy"
        >
          <View style={[styles.cardIcon, { backgroundColor: colors.primaryBg }]}>
            <Ionicons name="medkit" size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Pharmacy Login</Text>
            <Text style={styles.cardSub}>Order medicines, track deliveries, manage payments</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push("/auth/email?portal=distributor")}
          testID="portal-distributor"
        >
          <View style={[styles.cardIcon, { backgroundColor: colors.infoBg }]}>
            <Ionicons name="business" size={26} color={colors.info} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Distributor Login</Text>
            <Text style={styles.cardSub}>Owner, Manager, Field Sales & Delivery staff</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>New to RX Tech?</Text>
          <View style={styles.line} />
        </View>

        <TouchableOpacity style={styles.registerBtn} onPress={() => router.push("/auth/register")} testID="go-register">
          <Ionicons name="person-add-outline" size={18} color={colors.primary} />
          <Text style={styles.registerText}>Register your Pharmacy or Distributorship</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, paddingTop: 48, flexGrow: 1 },
  logo: {
    width: 76, height: 76, borderRadius: 22, backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center", flexDirection: "row",
    borderWidth: 2, borderColor: colors.primary, alignSelf: "center",
  },
  logoR: { fontSize: 30, fontWeight: "800", color: colors.text },
  logoX: { fontSize: 30, fontWeight: "800", color: colors.primary },
  brand: { fontSize: 26, fontWeight: "800", color: colors.text, textAlign: "center", marginTop: 14, letterSpacing: -0.5 },
  tag: { fontSize: 13, color: colors.textSecondary, textAlign: "center", marginTop: 4 },

  prompt: { fontSize: 14, fontWeight: "700", color: colors.text, marginTop: 40, marginBottom: 14 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#FFF",
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12,
  },
  cardIcon: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15.5, fontWeight: "800", color: colors.text },
  cardSub: { fontSize: 12, color: colors.textSecondary, marginTop: 3, lineHeight: 16 },

  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 24, marginBottom: 16 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 12, color: colors.textTertiary, fontWeight: "600" },

  registerBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1.5, borderColor: colors.primary, borderRadius: 12, paddingVertical: 15,
  },
  registerText: { color: colors.primary, fontWeight: "800", fontSize: 13.5 },
});
