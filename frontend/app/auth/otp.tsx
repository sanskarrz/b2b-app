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
import { useState, useRef, useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/src/components/Button";
import { api, setToken } from "@/src/api";
import { colors } from "@/src/theme";

export default function OtpScreen() {
  const router = useRouter();
  const { email, devOtp } = useLocalSearchParams<{ email: string; devOtp?: string }>();
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const inputs = useRef<TextInput[]>([]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const handleChange = (val: string, idx: number) => {
    const sanitized = val.replace(/\D/g, "");
    if (!sanitized) {
      const next = [...otp];
      next[idx] = "";
      setOtp(next);
      return;
    }
    // paste full code
    if (sanitized.length === 6) {
      setOtp(sanitized.split(""));
      inputs.current[5]?.blur();
      return;
    }
    const next = [...otp];
    next[idx] = sanitized[0];
    setOtp(next);
    if (idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handleKey = (e: any, idx: number) => {
    if (e.nativeEvent.key === "Backspace" && !otp[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  const code = otp.join("");

  const onVerify = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const res: any = await api("/auth/verify-otp", {
        method: "POST",
        body: { email, otp: code },
        auth: false,
      });
      await setToken(res.token);
      if (res.onboarded) router.replace("/(tabs)/home");
      else router.replace("/auth/onboarding");
    } catch (e: any) {
      Alert.alert("Invalid OTP", e.message || "Please check the code");
      setOtp(["", "", "", "", "", ""]);
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (resendIn > 0) return;
    try {
      const res: any = await api("/auth/send-otp", {
        method: "POST",
        body: { email },
        auth: false,
      });
      setResendIn(30);
      if (res.dev_otp) {
        Alert.alert("OTP Resent", `Dev OTP: ${res.dev_otp}`);
      } else {
        Alert.alert("OTP Resent", `Check ${email}`);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          testID="otp-back"
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.content}>
          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to{"\n"}
            <Text style={{ fontWeight: "700", color: colors.text }}>{email}</Text>
          </Text>

          {devOtp ? (
            <View style={styles.devBanner}>
              <Ionicons name="information-circle" size={16} color={colors.info} />
              <Text style={styles.devBannerText}>Dev mode • OTP: {devOtp}</Text>
            </View>
          ) : null}

          <View style={styles.otpRow}>
            {otp.map((v, i) => (
              <TextInput
                key={i}
                ref={(r) => {
                  if (r) inputs.current[i] = r;
                }}
                style={[styles.otpBox, v ? styles.otpBoxFilled : null]}
                value={v}
                onChangeText={(val) => handleChange(val, i)}
                onKeyPress={(e) => handleKey(e, i)}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus={i === 0}
                testID={`otp-input-${i}`}
              />
            ))}
          </View>

          <Button
            title="Verify & Continue"
            onPress={onVerify}
            disabled={code.length !== 6}
            loading={loading}
            fullWidth
            testID="verify-otp-btn"
          />

          <TouchableOpacity onPress={onResend} disabled={resendIn > 0} style={styles.resend}>
            <Text
              style={[
                styles.resendText,
                resendIn === 0 && { color: colors.text, fontWeight: "700" },
              ]}
            >
              {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    marginTop: 4,
  },
  content: { flex: 1, padding: 24 },
  title: { fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 8, lineHeight: 22 },
  devBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.infoBg,
    padding: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  devBannerText: { color: colors.info, fontSize: 13, fontWeight: "600" },
  otpRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 36, marginBottom: 36 },
  otpBox: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    backgroundColor: colors.surface,
  },
  otpBoxFilled: { borderColor: colors.text, backgroundColor: colors.bg },
  resend: { alignItems: "center", marginTop: 20 },
  resendText: { color: colors.textSecondary, fontSize: 14 },
});
