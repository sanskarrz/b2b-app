// Self-registration — Pharmacy or Distributor. Goes live immediately; the user
// then verifies an email OTP and lands in the right app.
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { api } from "@/src/api";
import { showError } from "@/src/components/Toast";
import { colors } from "@/src/theme";

type Acct = "pharmacy" | "distributor";

// Defined OUTSIDE Register — a component declared inside the parent would be a new
// type on every render, remounting the TextInput and losing focus on each keystroke.
function Field({ label, value, onChangeText, placeholder, keyboardType, optional, autoCapitalize, testID }: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder: string;
  keyboardType?: any; optional?: boolean; autoCapitalize?: any; testID: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}{optional ? <Text style={styles.optional}> (optional)</Text> : null}
      </Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType || "default"}
        autoCapitalize={autoCapitalize || "words"}
        testID={testID}
      />
    </View>
  );
}

export default function Register() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const [acct, setAcct] = useState<Acct>(params.type === "distributor" ? "distributor" : "pharmacy");
  const [f, setF] = useState({
    name: "", email: "", phone: "", business_name: "",
    gst: "", drug_license: "", address: "", city: "", area: "",
  });
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const isDist = acct === "distributor";

  const submit = async () => {
    if (!f.name.trim()) return showError("Please enter your name", "Missing details");
    if (!f.email.trim() || !/^\S+@\S+\.\S+$/.test(f.email.trim())) return showError("Please enter a valid email", "Missing details");
    if (!f.phone.trim()) return showError("Please enter your phone number", "Missing details");
    if (!f.business_name.trim()) return showError(isDist ? "Please enter your firm name" : "Please enter your shop name", "Missing details");

    setBusy(true);
    try {
      const r = await api("/auth/register", {
        method: "POST",
        body: {
          account_type: acct,
          name: f.name.trim(),
          email: f.email.trim().toLowerCase(),
          phone: f.phone.trim(),
          business_name: f.business_name.trim(),
          gst: f.gst.trim() || undefined,
          drug_license: f.drug_license.trim() || undefined,
          address: f.address.trim() || undefined,
          city: f.city.trim() || undefined,
          area: f.area.trim() || undefined,
        },
      });
      router.replace({
        pathname: "/auth/otp",
        params: { email: f.email.trim().toLowerCase(), devOtp: r.dev_otp || "", portal: acct },
      });
    } catch (e: any) {
      showError(e?.message || "Could not register", "Registration failed");
    } finally {
      setBusy(false);
    }
  };



  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10} testID="reg-back">
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Create account</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>I am registering as</Text>
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, !isDist && styles.toggleActive]}
              onPress={() => setAcct("pharmacy")}
              testID="reg-type-pharmacy"
            >
              <Ionicons name="medkit-outline" size={18} color={!isDist ? colors.primary : colors.textSecondary} />
              <Text style={[styles.toggleText, !isDist && styles.toggleTextActive]}>Pharmacy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, isDist && styles.toggleActive]}
              onPress={() => setAcct("distributor")}
              testID="reg-type-distributor"
            >
              <Ionicons name="business-outline" size={18} color={isDist ? colors.primary : colors.textSecondary} />
              <Text style={[styles.toggleText, isDist && styles.toggleTextActive]}>Distributor</Text>
            </TouchableOpacity>
          </View>

          <Field label="Your name" value={f.name} onChangeText={set("name")} placeholder="e.g. Ramesh Kumar" testID="reg-name" />
          <Field label="Email" value={f.email} onChangeText={set("email")} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" testID="reg-email" />
          <Field label="Phone" value={f.phone} onChangeText={set("phone")} placeholder="10-digit mobile" keyboardType="phone-pad" testID="reg-phone" />
          <Field
            label={isDist ? "Firm / Distributorship name" : "Pharmacy / Shop name"}
            value={f.business_name}
            onChangeText={set("business_name")}
            placeholder={isDist ? "e.g. N N Enterprise" : "e.g. Apollo Medical Store"}
            testID="reg-business_name"
          />

          <Text style={styles.sectionLabel}>Business details</Text>
          <Field label="GST number" value={f.gst} onChangeText={set("gst")} placeholder="27ABCDE1234F1Z5" optional autoCapitalize="characters" testID="reg-gst" />
          <Field label="Drug licence no." value={f.drug_license} onChangeText={set("drug_license")} placeholder="MH-XXXXX" optional autoCapitalize="characters" testID="reg-drug_license" />
          <Field label="Address" value={f.address} onChangeText={set("address")} placeholder="Shop / office address" optional testID="reg-address" />
          <Field label="City" value={f.city} onChangeText={set("city")} placeholder="e.g. Mumbai" optional testID="reg-city" />
          {isDist && <Field label="Area / Route" value={f.area} onChangeText={set("area")} placeholder="e.g. Andheri West" optional testID="reg-area" />}

          <TouchableOpacity style={[styles.submit, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy} testID="reg-submit">
            {busy ? <ActivityIndicator color="#FFF" /> : (
              <>
                <Text style={styles.submitText}>Create {isDist ? "Distributor" : "Pharmacy"} account</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.footNote}>
            We&apos;ll email you a 6-digit code to verify and sign in. Only name, email, phone and
            {isDist ? " firm" : " shop"} name are required — you can add the rest later.
          </Text>

          <TouchableOpacity onPress={() => router.replace("/auth/choose")} style={{ marginTop: 18 }} testID="reg-have-account">
            <Text style={styles.loginLink}>Already registered? Log in</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 },
  title: { fontSize: 17, fontWeight: "800", color: colors.text },
  scroll: { padding: 16, paddingBottom: 48 },

  sectionLabel: { fontSize: 11, fontWeight: "800", color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginTop: 12 },
  toggle: { flexDirection: "row", gap: 10, marginBottom: 8 },
  toggleBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: "#FFF",
  },
  toggleActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  toggleText: { fontWeight: "700", fontSize: 13.5, color: colors.textSecondary },
  toggleTextActive: { color: colors.primary, fontWeight: "800" },

  field: { marginTop: 12 },
  label: { fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 6 },
  optional: { color: colors.textTertiary, fontWeight: "500" },
  input: {
    backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, color: colors.text,
  },

  submit: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, marginTop: 24,
  },
  submitText: { color: "#FFF", fontWeight: "800", fontSize: 15 },
  footNote: { fontSize: 11.5, color: colors.textSecondary, marginTop: 12, lineHeight: 16, textAlign: "center" },
  loginLink: { textAlign: "center", color: colors.primary, fontWeight: "700", fontSize: 13 },
});
