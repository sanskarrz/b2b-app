import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { colors } from "@/src/theme";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const token = await storage.secureGet("rxtech_token", "");
      if (!token) {
        router.replace("/auth/email");
        return;
      }
      try {
        const me = await api("/auth/me");
        if (!me.onboarded) {
          router.replace("/auth/onboarding");
        } else {
          router.replace("/(tabs)/home");
        }
      } catch (e) {
        await storage.secureRemove("rxtech_token");
        router.replace("/auth/email");
      }
    })();
  }, []);

  return (
    <View style={styles.container} testID="splash-screen">
      <View style={styles.logo}>
        <Text style={styles.logoText}>RX</Text>
      </View>
      <Text style={styles.brand}>RX Tech</Text>
      <Text style={styles.tag}>B2B Pharma Marketplace</Text>
      <ActivityIndicator color={colors.text} style={{ marginTop: 32 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  logoText: {
    color: "#FFF",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -1,
  },
  brand: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5,
  },
  tag: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 6,
  },
});
