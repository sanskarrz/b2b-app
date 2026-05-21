import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { colors, radius } from "@/src/theme";

const FAQ = [
  { q: "How do I order from multiple distributors?", a: "Add products from any vendor. Cart automatically groups items by distributor and you can place per-vendor or all-at-once orders." },
  { q: "What is Shortbook?", a: "Shortbook flags SKUs below your minimum stock level with AI-suggested reorder quantities. Add all to cart in one tap from More → Shortbook." },
  { q: "How does Scan & Upload work?", a: "Tap the Scan button on the Search screen. Take a photo of a doctor's prescription or pharmacy bill. AI extracts medicines and matches them to our catalog — add all to cart in one tap." },
  { q: "How is GST calculated?", a: "All invoices on RX Tech are inclusive of 12% GST (standard pharma rate). View the GST breakdown in More → GST Invoices." },
  { q: "Can I return a product?", a: "Yes. Go to More → Returns & Refunds to view the list. Distributors typically approve returns for damaged or near-expiry stock." },
  { q: "When will my payment due reflect?", a: "Tap any invoice on the Payments tab to mark it paid. Status updates instantly along with the paid date." },
];

export default function Help() {
  const onEmail = () => Linking.openURL("mailto:support@rxtech.in?subject=RX Tech Support");
  const onCall = () => Linking.openURL("tel:+918000000000");

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Help & Support" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <View style={styles.contactRow}>
          <TouchableOpacity style={styles.contactCard} onPress={onEmail} testID="help-email">
            <Ionicons name="mail" size={22} color={colors.primary} />
            <Text style={styles.contactTitle}>Email us</Text>
            <Text style={styles.contactSub}>support@rxtech.in</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.contactCard} onPress={onCall} testID="help-call">
            <Ionicons name="call" size={22} color={colors.primary} />
            <Text style={styles.contactTitle}>Call us</Text>
            <Text style={styles.contactSub}>+91 80000 00000</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.section}>Frequently Asked Questions</Text>
        {FAQ.map((f, i) => (
          <View key={i} style={styles.faq}>
            <Text style={styles.q}>{f.q}</Text>
            <Text style={styles.a}>{f.a}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  contactRow: { flexDirection: "row", gap: 10, marginBottom: 22 },
  contactCard: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: "center",
    gap: 6,
  },
  contactTitle: { fontWeight: "800", color: colors.text, fontSize: 13, marginTop: 4 },
  contactSub: { color: colors.textSecondary, fontSize: 11 },
  section: { fontWeight: "800", fontSize: 14, color: colors.text, marginBottom: 12 },
  faq: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 8,
  },
  q: { fontWeight: "700", color: colors.text, fontSize: 13 },
  a: { color: colors.textSecondary, fontSize: 12, marginTop: 6, lineHeight: 18 },
});
