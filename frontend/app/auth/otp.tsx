import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState, useRef, useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/src/components/Button";
import { api, setToken } from "@/src/api";
import { showError, showSuccess, showInfo } from "@/src/components/Toast";
import { routeByRole } from "@/src/utils/routeByRole";
import { colors } from "@/src/theme";

export default function OtpScreen() {
  const router = useRouter();
  const { email, devOtp, portal } = useLocalSearchParams<{ email: string; devOtp?: string; portal?: string }>();
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const [hasError, setHasError] = useState(false);
  const [errorText, setErrorText] = useState("");
  const inputs = useRef<TextInput[]>([]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const clearError = () => { if (hasError) { setHasError(false); setErrorText(""); } };

  const handleChange = (val: string, idx: number) => {
    const sanitized = val.replace(/\D/g, "");
    clearError();
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
    if (code.length !== 6) {
      setHasError(true);
      setErrorText("Enter all 6 digits to continue");
      return;
    }
    setLoading(true);
    try {
      const res: any = await api("/auth/verify-otp", {
        method: "POST",
        body: { email, otp: code, portal: portal || undefined },
        auth: false,
      });
      await setToken(res.token);
      routeByRole(router, { ...(res.user || {}), onboarded: res.onboarded, role: res.user?.role });
    } catch (e: any) {
      setHasError(true);
      const msg = e?.message || "Please check the code";
      setErrorText(msg);
      showError(msg, "Invalid OTP");
      setOtp(["", "", "", "", "", ""]);
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (resendIn > 0) return;
    clearError();
    try {
      const res: any = await api("/auth/send-otp", {
        method: "POST",
        body: { email },
        auth: false,
      });
      setResendIn(30);
      if (res.dev_otp) {
        showInfo(`Dev OTP: ${res.dev_otp}`, "OTP Resent");
      } else {
        showSuccess(`Check ${email}`, "OTP Resent");
      }
    } catch (e: any) {
      showError(e?.message || "Could not resend OTP. Try again.", "Resend failed");
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
                style={[
                  styles.otpBox,
                  v ? styles.otpBoxFilled : null,
                  hasError ? styles.otpBoxError : null,
                ]}
                value={v}
                onChangeText={(val) => handleChange(val, i)}
                onKeyPress={(e) => handleKey(e, i)}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus={i === 0}
                textContentType={i === 0 ? "oneTimeCode" : "none"}
                autoComplete={i === 0 ? "sms-otp" : "off"}
                selectionColor="#000"
                testID={`otp-input-${i}`}
              />
            ))}
          </View>

          {hasError ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color={colors.danger} />
              <Text style={styles.errorText}>{errorText}</Text>
            </View>
          ) : null}

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
  otpRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 36, marginBottom: 12 },
  otpBox: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: "#000000",
    backgroundColor: "#FFFFFF",
  },
  otpBoxFilled: { borderColor: colors.text, backgroundColor: "#FFFFFF" },
  otpBoxError: { borderColor: colors.danger, backgroundColor: colors.dangerBg + "40" },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 18,
  },
  errorText: { color: colors.danger, fontSize: 12.5, fontWeight: "600", flex: 1 },
  resend: { alignItems: "center", marginTop: 20 },
  resendText: { color: colors.textSecondary, fontSize: 14 },
});
