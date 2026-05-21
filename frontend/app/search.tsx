import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

const RECENT = ["Azithromycin", "Paracetamol", "Cetirizine", "Metformin"];
const QUICK_FILTERS = ["Antibiotic", "Analgesic", "Diabetes", "Cardiac", "Gastric"];

export default function Search() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    const t = setTimeout(async () => {
      try {
        const data = await api(`/products?q=${encodeURIComponent(q)}`);
        setResults(data);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="search-back">
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.input}
              value={q}
              onChangeText={setQ}
              placeholder="Search medicine, salt, manufacturer"
              placeholderTextColor={colors.textTertiary}
              autoFocus
              testID="search-input"
            />
            {q.length > 0 && (
              <TouchableOpacity onPress={() => setQ("")}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {!searched ? (
          <View style={{ padding: 16 }}>
            <Text style={styles.sectionLabel}>Recent searches</Text>
            <View style={styles.chipRow}>
              {RECENT.map((r, i) => (
                <TouchableOpacity key={i} style={styles.chip} onPress={() => setQ(r)}>
                  <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
                  <Text style={styles.chipText}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Quick filters</Text>
            <View style={styles.chipRow}>
              {QUICK_FILTERS.map((f, i) => (
                <TouchableOpacity key={i} style={styles.chip} onPress={() => setQ(f)}>
                  <Text style={styles.chipText}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : loading ? (
          <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
        ) : results.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyText}>No products found for &quot;{q}&quot;</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/product/${item.id}`)}
                testID={`product-${item.id}`}
              >
                <View style={styles.thumb}>
                  <Text style={{ fontSize: 22 }}>{item.image_emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.salt}>
                    {item.salt} • {item.manufacturer}
                  </Text>
                  <Text style={styles.pack}>{item.pack}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <Text style={styles.ptr}>{formatINRFull(item.ptr)}</Text>
                    <Text style={styles.mrp}>MRP {formatINRFull(item.mrp)}</Text>
                    {item.scheme && (
                      <View style={styles.schemeBadge}>
                        <Text style={styles.schemeText}>{item.scheme}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <View style={styles.marginBadge}>
                    <Text style={styles.marginText}>{item.margin_pct.toFixed(1)}% margin</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} style={{ marginTop: 8 }} />
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 4,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  sectionLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: "700", marginBottom: 10, letterSpacing: 0.5 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
  },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  card: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 10,
    gap: 12,
    alignItems: "center",
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 14, fontWeight: "700", color: colors.text },
  salt: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  pack: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
  ptr: { fontSize: 15, fontWeight: "800", color: colors.text },
  mrp: { fontSize: 11, color: colors.textTertiary, textDecorationLine: "line-through" },
  schemeBadge: { backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  schemeText: { fontSize: 10, color: "#92400E", fontWeight: "700" },
  marginBadge: { backgroundColor: "#DCFCE7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  marginText: { fontSize: 10, color: "#15803D", fontWeight: "700" },
  empty: { alignItems: "center", marginTop: 60, gap: 10 },
  emptyText: { color: colors.textSecondary, fontSize: 13 },
});
