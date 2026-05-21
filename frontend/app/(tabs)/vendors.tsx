import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius } from "@/src/theme";

export default function Vendors() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api(`/distributors${query ? `?q=${encodeURIComponent(query)}` : ""}`)
      .then((d) => {
        if (active) setItems(d);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [query]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Distributors" subtitle={`${items.length} active vendors`} />
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or city"
          placeholderTextColor={colors.textTertiary}
          testID="vendors-search"
        />
        <TouchableOpacity style={styles.filterBtn}>
          <Ionicons name="options-outline" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 30 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/distributor/${item.id}`)}
              testID={`vendor-${item.id}`}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.short_name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={styles.meta}>{item.rating}</Text>
                  <Text style={styles.dot}>•</Text>
                  <Text style={styles.meta}>{item.location}</Text>
                  <Text style={styles.dot}>•</Text>
                  <Text style={styles.meta}>{item.delivery_time}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {item.categories.slice(0, 3).map((c: string, i: number) => (
                    <View key={i} style={styles.chip}>
                      <Text style={styles.chipText}>{c}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <View style={styles.discount}>
                  <Text style={styles.discountText}>{item.discount_label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} style={{ marginTop: 8 }} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 0 },
  filterBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 10,
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "800", color: colors.text },
  name: { fontSize: 14, fontWeight: "700", color: colors.text },
  meta: { fontSize: 11, color: colors.textSecondary, fontWeight: "500" },
  dot: { color: colors.textTertiary, fontSize: 11 },
  chip: { backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  chipText: { fontSize: 10, color: colors.textSecondary, fontWeight: "600" },
  discount: { backgroundColor: "#DCFCE7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  discountText: { fontSize: 10, color: "#15803D", fontWeight: "700" },
});
