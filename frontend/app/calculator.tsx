// Floating PTR/Margin Calculator
import { View, Text, StyleSheet, TextInput, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useState, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function Calculator() {
  const [mrp, setMrp] = useState("");
  const [ptr, setPtr] = useState("");
  const [gst, setGst] = useState("12");
  const [qty, setQty] = useState("1");

  const calc = useMemo(() => {
    const m = parseFloat(mrp) || 0;
    const p = parseFloat(ptr) || 0;
    const g = parseFloat(gst) || 0;
    const q = parseInt(qty) || 1;
    if (m <= 0 || p <= 0) return null;
    const margin_amt = m - p;
    const margin_pct = (margin_amt / m) * 100;
    const profit_per_unit = margin_amt;
    const total_profit = profit_per_unit * q;
    const total_cost = p * q;
    const total_sell = m * q;
    const gst_on_ptr = (p * g) / 100;
    const cost_with_gst = p + gst_on_ptr;
    return {
      margin_amt,
      margin_pct,
      profit_per_unit,
      total_profit,
      total_cost,
      total_sell,
      gst_on_ptr,
      cost_with_gst,
      q,
    };
  }, [mrp, ptr, gst, qty]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Margin Calculator" subtitle="PTR ↔ MRP ↔ Margin" showBack />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
          <Text style={styles.label}>MRP per unit (₹)</Text>
          <TextInput style={styles.input} value={mrp} onChangeText={setMrp} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textTertiary} />

          <Text style={[styles.label, { marginTop: 12 }]}>PTR per unit (₹)</Text>
          <TextInput style={styles.input} value={ptr} onChangeText={setPtr} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textTertiary} />

          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>GST %</Text>
              <TextInput style={styles.input} value={gst} onChangeText={setGst} keyboardType="decimal-pad" placeholder="12" placeholderTextColor={colors.textTertiary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Qty</Text>
              <TextInput style={styles.input} value={qty} onChangeText={setQty} keyboardType="number-pad" placeholder="1" placeholderTextColor={colors.textTertiary} />
            </View>
          </View>

          {calc && (
            <View style={styles.results}>
              <Text style={styles.resultTitle}>Results</Text>
              <Row label="Margin %" value={`${calc.margin_pct.toFixed(2)}%`} color={calc.margin_pct >= 25 ? colors.success : calc.margin_pct >= 15 ? colors.warning : colors.danger} bold />
              <Row label="Profit per unit" value={formatINRFull(calc.profit_per_unit)} />
              <Row label="GST on PTR" value={formatINRFull(calc.gst_on_ptr)} />
              <Row label="Cost incl. GST (per unit)" value={formatINRFull(calc.cost_with_gst)} />
              {calc.q > 1 && (
                <>
                  <View style={styles.divider} />
                  <Row label={`Total cost (${calc.q} units)`} value={formatINRFull(calc.total_cost)} />
                  <Row label={`Total selling (${calc.q} units)`} value={formatINRFull(calc.total_sell)} />
                  <Row label="Total profit" value={formatINRFull(calc.total_profit)} color={colors.success} bold />
                </>
              )}
            </View>
          )}

          <View style={styles.tipBox}>
            <Ionicons name="bulb" size={14} color={colors.warning} />
            <Text style={styles.tipText}>
              <Text style={{ fontWeight: "800" }}>Tip:</Text> Pharma standard margins — Generic: 35-50% | Branded ethical: 20-30% | OTC: 18-22%. Anything below 15% is usually a loss after expiry waste.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Row({ label, value, color, bold }: any) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, color && { color }, bold && { fontWeight: "800", fontSize: 16 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  label: { fontSize: 11, color: colors.textSecondary, fontWeight: "700", letterSpacing: 0.4, marginBottom: 6 },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, fontWeight: "700" },
  results: { marginTop: 18, padding: 14, backgroundColor: "#FFF", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  resultTitle: { fontWeight: "800", fontSize: 14, color: colors.text, marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { color: colors.textSecondary, fontSize: 13 },
  rowValue: { color: colors.text, fontWeight: "700", fontSize: 14 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
  tipBox: { marginTop: 14, flexDirection: "row", padding: 12, gap: 8, backgroundColor: colors.warningBg, borderRadius: 10, borderWidth: 1, borderColor: "#FDE68A" },
  tipText: { flex: 1, color: colors.text, fontSize: 11.5, lineHeight: 17 },
});
