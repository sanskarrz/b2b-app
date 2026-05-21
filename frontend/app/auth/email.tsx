import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { colors } from "@/src/theme";

export default function EmailEntry() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const onContinue = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      const res: any = await api("/auth/send-otp", {
        method: "POST",
        body: { email: email.trim() },
        auth: false,
      });
      router.push({
        pathname: "/auth/otp",
        params: { email: email.trim(), devOtp: res.dev_otp || "" },
      });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not send OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.content}>
          <View style={styles.logoBox}>
            <Text style={styles.logoR}>R</Text>
            <Text style={styles.logoX}>X</Text>
          </View>
          <Text style={styles.brand}>
            <Text style={{ color: colors.accent }}>RX</Text> Tech
          </Text>
          <Text style={styles.tag}>The B2B medicine marketplace built for pharmacies.</Text>

          <View style={{ height: 40 }} />

          <Text style={styles.label}>Email</Text>
          <View style={styles.inputRow}>
            <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@pharmacy.com"
              placeholderTextColor={colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              testID="email-input"
            />
          </View>
          <Text style={styles.help}>We&apos;ll send a 6-digit OTP to verify.</Text>

          <View style={{ height: 28 }} />

          <Button
            title="Continue"
            onPress={onContinue}
            disabled={!isValid}
            loading={loading}
            fullWidth
            testID="email-continue-btn"
          />

          <View style={styles.legal}>
            <Text style={styles.legalText}>
              By continuing, you agree to RX Tech&apos;s Terms & Privacy Policy.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, padding: 24, justifyContent: "center" },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    flexDirection: "row",
    borderWidth: 2,
    borderColor: colors.primary,
  },
  logoR: { color: colors.accent, fontSize: 30, fontWeight: "900", letterSpacing: -1.5 },
  logoX: { color: colors.primary, fontSize: 30, fontWeight: "900", letterSpacing: -1.5 },
  brand: { fontSize: 32, fontWeight: "800", color: colors.text, letterSpacing: -1 },
  tag: { fontSize: 14, color: colors.textSecondary, marginTop: 6, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 8 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    marginLeft: 10,
    paddingVertical: 0,
  },
  help: { fontSize: 12, color: colors.textSecondary, marginTop: 8 },
  legal: { marginTop: 32, alignItems: "center" },
  legalText: { fontSize: 11, color: colors.textTertiary, textAlign: "center" },
});
