// Small shared rating widgets: credit grade pill, star display & star input.
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

const GRADE_COLORS: Record<string, { bg: string; fg: string }> = {
  "A+": { bg: "#DCFCE7", fg: "#15803D" },
  A: { bg: "#DCFCE7", fg: "#15803D" },
  B: { bg: "#FEF3C7", fg: "#92400E" },
  C: { bg: "#FFEDD5", fg: "#C2410C" },
  D: { bg: "#FEE2E2", fg: "#B91C1C" },
  New: { bg: "#F1F5F9", fg: "#475569" },
};

export function GradePill({ grade, score, testID }: { grade?: string; score?: number | null; testID?: string }) {
  const g = grade || "New";
  const c = GRADE_COLORS[g] || GRADE_COLORS.New;
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]} testID={testID}>
      <Text style={[styles.pillText, { color: c.fg }]}>Credit {g}{score != null ? ` · ${score}` : ""}</Text>
    </View>
  );
}

export function StarsView({ avg, count, size = 12 }: { avg?: number | null; count?: number; size?: number }) {
  if (!avg) return <Text style={styles.muted}>No ratings yet</Text>;
  return (
    <View style={styles.row}>
      <Ionicons name="star" size={size} color="#F59E0B" />
      <Text style={styles.avg}>{avg}</Text>
      {count != null && <Text style={styles.muted}>({count})</Text>}
    </View>
  );
}

export function StarsInput({ value, onChange, testID = "stars" }: { value: number; onChange: (n: number) => void; testID?: string }) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} hitSlop={6} style={styles.starBtn} testID={`${testID}-${n}`}>
          <Ionicons name={n <= value ? "star" : "star-outline"} size={28} color="#F59E0B" />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start" },
  pillText: { fontSize: 10.5, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  avg: { fontSize: 12, fontWeight: "800", color: colors.text },
  muted: { fontSize: 11, color: colors.textSecondary },
  starBtn: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
});
