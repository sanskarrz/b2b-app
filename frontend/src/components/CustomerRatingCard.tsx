// Distributor → customer: credit rating (auto + stars), rate the pharmacy, unmap.
import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { confirm } from "@/src/components/confirm";
import { GradePill, StarsView, StarsInput } from "@/src/components/Ratings";
import { colors, radius, formatINRFull } from "@/src/theme";

export function CustomerRatingCard({ custId, onChange }: { custId: string; onChange?: () => void }) {
  const [r, setR] = useState<any>(null);
  const [stars, setStars] = useState(0);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const x = await api(`/distributor/me/customers/${custId}/rating`); setR(x); setStars(x.my_stars || 0); } catch {}
  }, [custId]);
  useEffect(() => { load(); }, [load]);

  const rate = async (n: number) => {
    setStars(n);
    try { await api(`/distributor/me/customers/${custId}/rating`, { method: "POST", body: { stars: n } }); showSuccess("Rating saved"); load(); }
    catch (e: any) { showError(e.message); }
  };
  const unmap = () => confirm("Unmap this pharmacy?", "They can no longer order on credit. Cash orders still work.", [
    { text: "Cancel", style: "cancel" },
    { text: "Unmap", style: "destructive", onPress: async () => {
      setBusy(true);
      try { await api(`/distributor/me/customers/${custId}/unmap`, { method: "POST" }); showSuccess("Unmapped"); load(); onChange?.(); }
      catch (e: any) { showError(e.message); } finally { setBusy(false); }
    } },
  ]);

  if (!r) return null;
  return (
    <View style={styles.card} testID="customer-rating-card">
      <View style={styles.row}>
        <Text style={styles.title}>Credit rating</Text>
        <GradePill grade={r.grade} score={r.score} />
        <View style={{ flex: 1 }} />
        <StarsView avg={r.stars_avg} count={r.stars_count} />
      </View>
      <Text style={styles.sub}>{r.paid_on_time}/{r.paid} bills paid on time · {r.overdue_count} overdue ({formatINRFull(r.overdue_amount || 0)})</Text>
      <Text style={[styles.sub, { marginTop: 8, fontWeight: "800" }]}>Your rating of this pharmacy</Text>
      <StarsInput value={stars} onChange={rate} testID="rate-cust" />
      <View style={styles.row}>
        <Text style={[styles.sub, { flex: 1 }]}>Mapping: <Text style={{ fontWeight: "800", color: r.mapping_status === "mapped" ? colors.success : colors.textSecondary }}>{r.mapping_status}</Text></Text>
        {r.mapping_status === "mapped" && (
          <TouchableOpacity style={styles.unmap} onPress={unmap} disabled={busy} testID="cust-unmap">
            {busy ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={styles.unmapText}>Unmap</Text>}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { margin: 16, marginBottom: 0, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: "#FFF", gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontWeight: "800", fontSize: 14, color: colors.text },
  sub: { fontSize: 12, color: colors.textSecondary },
  unmap: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, height: 38, borderRadius: 10, justifyContent: "center" },
  unmapText: { color: colors.danger, fontWeight: "800" },
});
