import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function Shortbook() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api("/shortbook");
      setItems(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const addAll = async () => {
    setAdding(true);
    try {
      for (const it of items) {
        await api(`/shortbook/${it.id}/order`, { method: "POST" });
      }
      Alert.alert("Added to cart", `${items.length} SKUs added to cart`, [
        { text: "View Cart", onPress: () => router.push("/cart") },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setAdding(false);
      load();
    }
  };

  const addOne = async (id: string) => {
    await api(`/shortbook/${id}/order`, { method: "POST" });
    load();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Shortbook" subtitle="AI-suggested reorders" showBack />
      {loading ? (
        <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
      ) : (
        <>
          {items.length > 0 && (
            <View style={styles.summary}>
              <View>
                <Text style={styles.sumLabel}>{items.length} SKUs • Total Value</Text>
                <Text style={styles.sumValue}>{formatINRFull(total)}</Text>
              </View>
              <Button
                title="Add all to Cart"
                onPress={addAll}
                loading={adding}
                small
                testID="shortbook-add-all"
              />
            </View>
          )}
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle" size={48} color={colors.success} />
              <Text style={styles.emptyText}>All stock levels healthy!</Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(i) => i.id}
              contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 30 }}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <View style={styles.iconBox}>
                    <Ionicons name="alert-circle" size={20} color={colors.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.product_name}</Text>
                    <Text style={styles.meta}>
                      Stock: <Text style={{ color: colors.danger, fontWeight: "700" }}>{item.current_stock}</Text> • Min: {item.min_level}
                    </Text>
                    <Text style={styles.suggest}>
                      Suggested: <Text style={{ fontWeight: "800", color: colors.text }}>{item.suggested_qty} units</Text>
                    </Text>
                    <Text style={styles.value}>{formatINRFull(item.estimated_value)}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.addBtn}
                    onPress={() => addOne(item.id)}
                    testID={`shortbook-add-${item.id}`}
                  >
                    <Ionicons name="add" size={18} color="#FFF" />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    margin: 16,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sumLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  sumValue: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 4, letterSpacing: -0.5 },
  card: {
    flexDirection: "row",
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: 10,
    gap: 12,
    alignItems: "center",
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.warningBg,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontWeight: "700", color: colors.text, fontSize: 14 },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  suggest: { fontSize: 12, color: colors.text, marginTop: 3 },
  value: { fontWeight: "800", color: colors.text, fontSize: 14, marginTop: 4 },
  addBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.text, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { color: colors.textSecondary, fontSize: 15, fontWeight: "600" },
});
