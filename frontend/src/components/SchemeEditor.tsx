// Distributor scheme picker: free qty (10+1) · % off · ₹ off · quantity slabs · custom text
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/src/theme";

const TYPES = [
  { k: "none", l: "None" }, { k: "free", l: "Free qty" }, { k: "percent", l: "% off" },
  { k: "rupee", l: "₹ off" }, { k: "slab", l: "Slabs" }, { k: "custom", l: "Custom" },
];

export type SchemeDet = { type: string; buy?: number; free?: number; pct?: number; amount?: number; text?: string; slabs?: { min_qty: number; buy: number; free: number }[] };

const num = (v: string) => (v === "" ? undefined : Number(v.replace(/[^\d.]/g, "")));

export function SchemeEditor({ value, onChange }: { value: SchemeDet; onChange: (v: SchemeDet) => void }) {
  const t = value.type || "none";
  const set = (p: Partial<SchemeDet>) => onChange({ ...value, ...p });
  const slabs = value.slabs || [];
  const In = ({ v, on, ph, w = 70, tid }: any) => (
    <TextInput style={[styles.in, { width: w }]} value={v == null ? "" : String(v)} onChangeText={on} placeholder={ph}
      placeholderTextColor={colors.textTertiary} keyboardType="decimal-pad" testID={tid} />
  );
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>Scheme</Text>
      <View style={styles.chips}>
        {TYPES.map((x) => (
          <TouchableOpacity key={x.k} style={[styles.chip, t === x.k && styles.chipOn]} onPress={() => onChange({ type: x.k, slabs: x.k === "slab" ? (slabs.length ? slabs : [{ min_qty: 1, buy: 10, free: 1 }]) : undefined })} testID={`scheme-type-${x.k}`}>
            <Text style={[styles.chipText, t === x.k && { color: "#FFF" }]}>{x.l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {t === "free" && (
        <View style={styles.row}><Text style={styles.t}>Buy</Text><In v={value.buy} on={(v: string) => set({ buy: num(v) })} ph="10" tid="scheme-buy" /><Text style={styles.t}>get</Text><In v={value.free} on={(v: string) => set({ free: num(v) })} ph="1" tid="scheme-free" /><Text style={styles.t}>free</Text></View>
      )}
      {t === "percent" && <View style={styles.row}><In v={value.pct} on={(v: string) => set({ pct: num(v) })} ph="5" tid="scheme-pct" /><Text style={styles.t}>% off PTR</Text></View>}
      {t === "rupee" && <View style={styles.row}><Text style={styles.t}>₹</Text><In v={value.amount} on={(v: string) => set({ amount: num(v) })} ph="2" tid="scheme-amt" /><Text style={styles.t}>off per unit</Text></View>}
      {t === "custom" && (
        <TextInput style={[styles.in, { width: "100%" }]} value={value.text || ""} onChangeText={(v) => set({ text: v })} placeholder="e.g. 2 strips free on 1 box" placeholderTextColor={colors.textTertiary} testID="scheme-text" />
      )}
      {t === "slab" && (
        <View style={{ gap: 6 }}>
          {slabs.map((s, i) => {
            const up = (p: any) => set({ slabs: slabs.map((x, j) => (j === i ? { ...x, ...p } : x)) });
            return (
              <View key={i} style={styles.row}>
                <Text style={styles.t}>From qty</Text><In v={s.min_qty} on={(v: string) => up({ min_qty: num(v) })} w={56} />
                <In v={s.buy} on={(v: string) => up({ buy: num(v) })} w={50} /><Text style={styles.t}>+</Text><In v={s.free} on={(v: string) => up({ free: num(v) })} w={50} />
                <TouchableOpacity onPress={() => set({ slabs: slabs.filter((_, j) => j !== i) })} hitSlop={8}><Ionicons name="close-circle" size={20} color={colors.danger} /></TouchableOpacity>
              </View>
            );
          })}
          <TouchableOpacity onPress={() => set({ slabs: [...slabs, { min_qty: (slabs[slabs.length - 1]?.min_qty || 0) + 10, buy: 10, free: 2 }] })} style={{ minHeight: 36, justifyContent: "center" }} testID="scheme-add-slab">
            <Text style={{ color: colors.primary, fontWeight: "800" }}>+ Add slab</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, height: 34, justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  t: { fontSize: 13, color: colors.text, fontWeight: "600" },
  in: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, height: 40, paddingHorizontal: 8, fontSize: 14, color: "#000", backgroundColor: "#FFF" },
});
