import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

function formatDate(iso: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
  } catch {
    return iso;
  }
}

export default function GstInvoices() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/reports/gst-invoices")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="GST Invoices" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="GST Invoices" subtitle={`${data.items.length} invoices`} showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <View style={styles.summary}>
          <View style={styles.sumItem}>
            <Text style={styles.sumLabel}>Taxable</Text>
            <Text style={styles.sumValue}>{formatINRFull(data.total_taxable)}</Text>
          </View>
          <View style={styles.sumItem}>
            <Text style={styles.sumLabel}>GST (12%)</Text>
            <Text style={[styles.sumValue, { color: colors.primary }]}>{formatINRFull(data.total_gst)}</Text>
          </View>
          <View style={styles.sumItem}>
            <Text style={styles.sumLabel}>Total</Text>
            <Text style={styles.sumValue}>{formatINRFull(data.total_invoice)}</Text>
          </View>
        </View>

        {data.items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No invoices yet</Text>
          </View>
        ) : (
          data.items.map((it: any) => (
            <TouchableOpacity
              key={it.id}
              style={styles.row}
              onPress={() => router.push(`/invoice/${it.id}`)}
              testID={`gst-${it.id}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.code}>{it.invoice_code}</Text>
                <Text style={styles.dist}>{it.distributor}</Text>
                <Text style={styles.date}>{formatDate(it.date)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.amount}>{formatINRFull(it.total)}</Text>
                <Text style={styles.tax}>incl. GST {formatINRFull(it.gst)}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  summary: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sumItem: { flex: 1, alignItems: "center" },
  sumLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  sumValue: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 4 },
  row: {
    flexDirection: "row",
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 8,
    gap: 10,
  },
  code: { fontWeight: "800", color: colors.text, fontSize: 13 },
  dist: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  date: { color: colors.textTertiary, fontSize: 10, marginTop: 4 },
  amount: { fontWeight: "800", color: colors.text, fontSize: 14 },
  tax: { color: colors.textSecondary, fontSize: 10, marginTop: 4 },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { color: colors.textSecondary, fontSize: 13 },
});
