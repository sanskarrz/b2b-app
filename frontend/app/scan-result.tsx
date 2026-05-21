import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

export default function ScanResult() {
  const { image } = useLocalSearchParams<{ image: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [addedAll, setAddedAll] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api("/scan/extract", {
          method: "POST",
          body: { image_base64: image },
        });
        setData(res);
      } catch (e: any) {
        setError(e.message || "Could not analyse image");
      } finally {
        setLoading(false);
      }
    })();
  }, [image]);

  const addOne = async (m: any) => {
    if (!m.product) return;
    setAdding(m.product.id);
    try {
      await api("/cart/items", {
        method: "POST",
        body: {
          product_id: m.product.id,
          distributor_id: m.product.best_distributor_id,
          qty: 1,
        },
      });
    } finally {
      setAdding(null);
    }
  };

  const addAll = async () => {
    if (!data) return;
    setAdding("ALL");
    try {
      for (const m of data.matches) {
        if (m.product) {
          await api("/cart/items", {
            method: "POST",
            body: {
              product_id: m.product.id,
              distributor_id: m.product.best_distributor_id,
              qty: 1,
            },
          });
        }
      }
      setAddedAll(true);
      Alert.alert("Added to cart", `${data.matches.filter((m: any) => m.product).length} items added`, [
        { text: "View Cart", onPress: () => router.push("/cart") },
        { text: "OK", style: "cancel" },
      ]);
    } finally {
      setAdding(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Scanning…" showBack />
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingTitle}>Reading prescription / bill</Text>
          <Text style={styles.loadingSub}>AI is extracting medicine names and matching to vendors…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Scan failed" showBack />
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={48} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Try again" onPress={() => router.back()} small />
        </View>
      </SafeAreaView>
    );
  }

  const foundCount = data?.matches?.filter((m: any) => m.product).length || 0;
  const totalCount = data?.matches?.length || 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Scan result" subtitle={`${foundCount}/${totalCount} matched`} showBack />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View style={styles.summary}>
          <Ionicons name="sparkles" size={18} color={colors.primary} />
          <Text style={styles.summaryText}>
            Extracted <Text style={{ fontWeight: "800" }}>{data.extracted.length}</Text> medicine names from the image
          </Text>
        </View>

        {data.matches.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={42} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No medicines detected</Text>
            <Text style={styles.emptySub}>Try a clearer image of the prescription or bill</Text>
          </View>
        ) : (
          data.matches.map((m: any, idx: number) => (
            <View key={idx} style={styles.card}>
              <View style={styles.scanRow}>
                <Ionicons name="scan-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.scanName}>{m.scanned_name}</Text>
              </View>
              {m.product ? (
                <TouchableOpacity
                  style={styles.matched}
                  onPress={() => router.push(`/product/${m.product.id}`)}
                >
                  <Text style={{ fontSize: 26 }}>{m.product.image_emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pName}>{m.product.name}</Text>
                    <Text style={styles.pMeta}>
                      {m.product.manufacturer} • {m.product.pack}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <Text style={styles.pPrice}>{formatINRFull(m.product.ptr)}</Text>
                      {m.best_distributor && (
                        <View style={styles.bestPill}>
                          <Ionicons name="star" size={9} color="#FFF" />
                          <Text style={styles.bestText}>Best from {m.best_distributor.short_name}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.addBtn}
                    onPress={() => addOne(m)}
                    disabled={adding === m.product.id}
                    testID={`scan-add-${idx}`}
                  >
                    <Ionicons name={adding === m.product.id ? "hourglass" : "add"} size={20} color="#FFF" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ) : (
                <View style={styles.unmatched}>
                  <Ionicons name="help-circle-outline" size={20} color={colors.textTertiary} />
                  <Text style={styles.unmatchedText}>No match in catalog</Text>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {foundCount > 0 && !addedAll && (
        <View style={styles.bottomBar}>
          <Button
            title={adding === "ALL" ? "Adding…" : `Add all ${foundCount} to cart`}
            onPress={addAll}
            loading={adding === "ALL"}
            fullWidth
            testID="scan-add-all"
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  loadingTitle: { fontWeight: "800", fontSize: 16, color: colors.text, marginTop: 8 },
  loadingSub: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
  errorBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  errorText: { color: colors.text, fontSize: 14, textAlign: "center" },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  summaryText: { color: colors.text, fontSize: 13, flex: 1 },
  card: { marginBottom: 12 },
  scanRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  scanName: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.3, fontStyle: "italic" },
  matched: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
  },
  pName: { fontWeight: "800", color: colors.text, fontSize: 14 },
  pMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  pPrice: { fontWeight: "800", color: colors.text, fontSize: 13 },
  bestPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  bestText: { color: "#FFF", fontWeight: "700", fontSize: 9 },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  unmatched: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  unmatchedText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", padding: 40, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  emptySub: { color: colors.textSecondary, fontSize: 13, textAlign: "center" },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    paddingBottom: 22,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
