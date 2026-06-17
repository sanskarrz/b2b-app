// Staff password login (managers / field sales / delivery)
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
import { useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/src/components/Button";
import { api, setToken } from "@/src/api";
import { showError } from "@/src/components/Toast";
import { routeByRole } from "@/src/utils/routeByRole";
import { colors } from "@/src/theme";

export default function StaffLogin() {
  const router = useRouter();
  const { email, name } = useLocalSearchParams<{ email: string; name?: string }>();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    if (!password) { showError("Enter your password"); return; }
    setLoading(true);
    try {
      const res: any = await api("/auth/login", {
        method: "POST",
        body: { email, password },
        auth: false,
      });
      await setToken(res.token);
      routeByRole(router, { ...(res.user || {}), onboarded: true, role: res.role });
    } catch (e: any) {
      showError(e?.message || "Incorrect email or password", "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.content}>
          <View style={styles.iconBox}><Ionicons name="briefcase" size={28} color={colors.primary} /></View>
          <Text style={styles.title}>Welcome{name ? `, ${name}` : ""}</Text>
          <Text style={styles.subtitle}>Sign in to your team account{"\n"}<Text style={{ fontWeight: "700", color: colors.text }}>{email}</Text></Text>

          <View style={{ height: 28 }} />
          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry={!show}
              autoCapitalize="none"
              autoFocus
              onSubmitEditing={onLogin}
              testID="password-input"
            />
            <TouchableOpacity onPress={() => setShow((s) => !s)}>
              <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={{ height: 28 }} />
          <Button title="Sign in" onPress={onLogin} loading={loading} disabled={!password} fullWidth testID="staff-login-btn" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: 8, marginTop: 4 },
  content: { flex: 1, padding: 24, justifyContent: "center" },
  iconBox: { width: 60, height: 60, borderRadius: 16, backgroundColor: colors.primaryBg, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  title: { fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 8, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 8 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 },
});
