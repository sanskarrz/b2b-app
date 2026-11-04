// Pharmacy — my credit rating (auto from payment history + stars from distributors)
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useCallback, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { GradePill, StarsView } from "@/src/components/Ratings";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function CreditRating() {
  const [r, setR] = useState<any>(null);
  useFocusEffect(useCallback(() => { api("/retail/credit-rating").then(setR).catch(() => setR({})); }, []));
  if (!r) return <SafeAreaView style={styles.c}><ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} /></SafeAreaView>;
  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <TopBar title="My Credit Rating" showBack />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={styles.hero} testID="credit-rating-card">
          <Text style={styles.grade}>{r.grade || "New"}</Text>
          <Text style={styles.score}>{r.score != null ? `Score ${r.score} / 100` : "Not enough payment history yet"}</Text>
          <GradePill grade={r.grade} score={r.score} />
        </View>
        <View style={styles.card}>
          <Row k="Bills" v={r.bills} />
          <Row k="Paid on time" v={`${r.paid_on_time} of ${r.paid}`} />
          <Row k="Overdue bills" v={r.overdue_count} warn={r.overdue_count > 0} />
          <Row k="Overdue amount" v={formatINRFull(r.overdue_amount || 0)} warn={r.overdue_amount > 0} />
          <View style={styles.row}><Text style={styles.k}>Distributor ratings</Text><StarsView avg={r.stars_avg} count={r.stars_count} /></View>
        </View>
        <Text style={styles.note}>Your rating is worked out from on-time payments, overdue amount and credit used. Distributors see it when you request mapping — pay on time to move up.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ k, v, warn }: { k: string; v: any; warn?: boolean }) {
  return <View style={styles.row}><Text style={styles.k}>{k}</Text><Text style={[styles.v, warn && { color: colors.danger }]}>{v}</Text></View>;
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  hero: { alignItems: "center", padding: 24, borderRadius: radius.lg, backgroundColor: colors.primaryBg, gap: 6 },
  grade: { fontSize: 48, fontWeight: "900", color: colors.primary },
  score: { fontSize: 13, color: colors.text, fontWeight: "700" },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  k: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  v: { color: colors.text, fontSize: 14, fontWeight: "800" },
  note: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
});
