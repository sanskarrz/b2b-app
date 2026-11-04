// Pharmacy ↔ distributor relationship card: mapping status + action, credit rating, stars.
import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { GradePill, StarsView, StarsInput } from "@/src/components/Ratings";
import { colors, radius } from "@/src/theme";

export function DistRelationCard({ distributorId, onChange }: { distributorId: string; onChange?: () => void }) {
  const [r, setR] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [stars, setStars] = useState(0);

  const load = useCallback(async () => {
    try {
      const x = await api(`/retail/distributors/${distributorId}/rating`);
      setR(x);
      setStars(x.my_stars || 0);
    } catch {}
  }, [distributorId]);
  useEffect(() => { load(); }, [load]);

  const act = async () => {
    setBusy(true);
    try {
      if (r.mapping_status === "mapped" || r.mapping_status === "pending") {
        await api(`/retail/mappings/${distributorId}`, { method: "DELETE" });
        showSuccess(r.mapping_status === "mapped" ? "Unmapped" : "Request withdrawn");
      } else {
        await api("/retail/mappings", { method: "POST", body: { distributor_id: distributorId } });
        showSuccess("Mapping request sent");
      }
      await load();
      onChange?.();
    } catch (e: any) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const rate = async (n: number) => {
    setStars(n);
    try {
      await api(`/retail/distributors/${distributorId}/rating`, { method: "POST", body: { stars: n } });
      showSuccess("Thanks for rating");
      load();
    } catch (e: any) {
      showError(e.message);
    }
  };

  if (!r) return null;
  const st = r.mapping_status;
  const label = st === "mapped" ? "Mapped" : st === "pending" ? "Request pending" : st === "rejected" ? "Request declined" : "Not mapped";
  const btn = st === "mapped" ? "Unmap" : st === "pending" ? "Withdraw" : "Request mapping";
  return (
    <View style={styles.card} testID="dist-relation-card">
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.status}>{label}</Text>
          <Text style={styles.sub}>{st === "mapped" ? "Credit & cash orders allowed" : "Cash / advance orders only"}</Text>
        </View>
        <TouchableOpacity style={[styles.btn, st === "mapped" ? styles.btnGhost : null]} onPress={act} disabled={busy} testID="dist-map-action">
          {busy ? <ActivityIndicator size="small" color={st === "mapped" ? colors.danger : "#FFF"} /> : <Text style={[styles.btnText, st === "mapped" && { color: colors.danger }]}>{btn}</Text>}
        </TouchableOpacity>
      </View>
      <View style={styles.divider} />
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.k}>Distributor rating</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <GradePill grade={r.grade} score={r.score} />
            <StarsView avg={r.stars_avg} count={r.stars_count} />
          </View>
          <Text style={styles.sub}>{r.delivered} delivered · {r.cancelled} cancelled · {r.queries_resolved}/{r.queries} queries solved</Text>
        </View>
      </View>
      <Text style={[styles.k, { marginTop: 10 }]}>Your rating</Text>
      <StarsInput value={stars} onChange={rate} testID="rate-dist" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { margin: 16, marginBottom: 0, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: "#FFF" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  status: { fontSize: 15, fontWeight: "800", color: colors.text },
  sub: { fontSize: 11.5, color: colors.textSecondary, marginTop: 2 },
  btn: { backgroundColor: colors.primary, paddingHorizontal: 14, height: 40, borderRadius: 10, justifyContent: "center", minWidth: 90, alignItems: "center" },
  btnGhost: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border },
  btnText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  k: { fontSize: 11, fontWeight: "800", color: colors.textSecondary, letterSpacing: 0.3 },
});
