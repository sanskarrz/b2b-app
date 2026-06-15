import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors } from "@/src/theme";

// GST format (relaxed): 2 digits state + 10 PAN chars + 1 digit + 1 letter + 1 alphanumeric
const GST_RX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9A-Z]$/;
// Drug License: e.g., 20B/21B and state code - relaxed: alphanumeric+/ 8-25 chars
const DL_RX = /^[A-Z0-9\-\/]{6,30}$/i;
// Food License (FSSAI): 14-digit number
const FSSAI_RX = /^[0-9]{14}$/;

export default function Onboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [shopName, setShopName] = useState("");
  const [gst, setGst] = useState("");
  const [drugLic, setDrugLic] = useState("");
  const [foodLic, setFoodLic] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Your name is required";
    else if (name.trim().length < 2) e.name = "Name must be at least 2 characters";

    if (!phone.trim()) e.phone = "Phone number is required";
    else if (!/^\d{10}$/.test(phone.trim())) e.phone = "Enter a valid 10-digit phone";
    else if (!/^[6-9]/.test(phone.trim())) e.phone = "Indian mobile must start with 6, 7, 8 or 9";

    if (gst.trim() && !GST_RX.test(gst.trim())) e.gst = "Invalid GSTIN format (e.g., 27ABCDE1234F1Z5)";
    if (drugLic.trim() && !DL_RX.test(drugLic.trim())) e.drug_license = "Invalid Drug License (e.g., MH-MUM-200012)";
    if (foodLic.trim() && !FSSAI_RX.test(foodLic.trim())) e.food_license = "FSSAI must be 14 digits";

    return e;
  }, [name, phone, gst, drugLic, foodLic]);

  const valid = !errors.name && !errors.phone && !errors.gst && !errors.drug_license && !errors.food_license;

  const markTouched = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  const onSubmit = async () => {
    setTouched({ name: true, phone: true, gst: true, drug_license: true, food_license: true });
    if (!valid) {
      const firstError = errors.name || errors.phone || errors.gst || errors.drug_license || errors.food_license;
      showError(firstError || "Please fix the highlighted fields", "Cannot save");
      return;
    }
    setLoading(true);
    try {
      await api("/auth/onboard", {
        method: "POST",
        body: {
          name: name.trim(),
          phone: phone.trim(),
          shop_name: shopName.trim(),
          gst: gst.trim(),
          drug_license: drugLic.trim(),
          food_license: foodLic.trim(),
          address: address.trim(),
        },
      });
      showSuccess("Welcome to RX Tech 🎉");
      router.replace("/(tabs)/home");
    } catch (e: any) {
      if (e?.fields && Object.keys(e.fields).length) {
        setTouched((t) => ({ ...t, ...Object.fromEntries(Object.keys(e.fields).map((k) => [k, true])) }));
        showError(e.message || "Please correct the highlighted fields", "Could not save");
      } else {
        showError(e?.message || "Could not complete setup. Try again.", "Save failed");
      }
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
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Set up your shop</Text>
          <Text style={styles.subtitle}>Tell us about you and your pharmacy.</Text>

          <Field
            label="Your name *"
            value={name}
            onChange={(v) => { setName(v); }}
            onBlur={() => markTouched("name")}
            placeholder="Dr. Rajesh Kumar"
            error={touched.name ? errors.name : undefined}
            testID="onb-name"
          />
          <Field
            label="Phone number *"
            value={phone}
            onChange={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
            onBlur={() => markTouched("phone")}
            placeholder="10-digit mobile"
            keyboardType="phone-pad"
            error={touched.phone ? errors.phone : undefined}
            testID="onb-phone"
          />
          <Field
            label="Shop name"
            value={shopName}
            onChange={setShopName}
            placeholder="Kumar Medical Stores"
            testID="onb-shop"
          />
          <Field
            label="GST number"
            value={gst}
            onChange={(v) => setGst(v.toUpperCase().slice(0, 15))}
            onBlur={() => markTouched("gst")}
            placeholder="27ABCDE1234F1Z5"
            error={touched.gst ? errors.gst : undefined}
            hint={!touched.gst || !errors.gst ? "Optional — leave blank if you don't have one" : undefined}
            testID="onb-gst"
            autoCapitalize="characters"
          />
          <Field
            label="Drug License No."
            value={drugLic}
            onChange={(v) => setDrugLic(v.toUpperCase().slice(0, 30))}
            onBlur={() => markTouched("drug_license")}
            placeholder="MH-MUM-200012"
            error={touched.drug_license ? errors.drug_license : undefined}
            hint={!touched.drug_license || !errors.drug_license ? "Optional — Form 20/21B license" : undefined}
            testID="onb-drug-lic"
            autoCapitalize="characters"
          />
          <Field
            label="FSSAI / Food License"
            value={foodLic}
            onChange={(v) => setFoodLic(v.replace(/\D/g, "").slice(0, 14))}
            onBlur={() => markTouched("food_license")}
            placeholder="14-digit FSSAI number"
            keyboardType="number-pad"
            error={touched.food_license ? errors.food_license : undefined}
            hint={!touched.food_license || !errors.food_license ? "Optional — for shops also selling food/nutraceuticals" : undefined}
            testID="onb-food-lic"
          />
          <Field
            label="Shop address"
            value={address}
            onChange={setAddress}
            placeholder="Street, City, Pincode"
            multiline
            testID="onb-address"
          />

          <View style={{ height: 24 }} />
          <Button
            title="Complete Setup"
            onPress={onSubmit}
            disabled={!valid}
            loading={loading}
            fullWidth
            testID="onb-submit"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  keyboardType,
  multiline,
  testID,
  error,
  hint,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  keyboardType?: any;
  multiline?: boolean;
  testID?: string;
  error?: string;
  hint?: string;
  autoCapitalize?: "characters" | "words" | "sentences" | "none";
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline && { height: 80, paddingTop: 14 },
          error ? styles.inputError : null,
        ]}
        value={value}
        onChangeText={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        testID={testID}
        autoCapitalize={autoCapitalize}
      />
      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={12} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 6, marginBottom: 28 },
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    height: 52,
    fontSize: 15,
    color: colors.text,
  },
  inputError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg + "40",
  },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  errorText: { fontSize: 11.5, color: colors.danger, fontWeight: "600" },
  hint: { fontSize: 11, color: colors.textTertiary, marginTop: 6, fontWeight: "500" },
});
