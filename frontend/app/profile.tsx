import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useEffect, useState, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { TopBar } from "@/src/components/TopBar";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius } from "@/src/theme";

const GST_RX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9A-Z]$/;
const DL_RX = /^[A-Z0-9\-\/]{6,30}$/i;
const FSSAI_RX = /^[0-9]{14}$/;

export default function Profile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [shopName, setShopName] = useState("");
  const [gst, setGst] = useState("");
  const [drugLic, setDrugLic] = useState("");
  const [foodLic, setFoodLic] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const me: any = await api("/auth/me");
        setName(me.name || "");
        setPhone(me.phone || "");
        setShopName(me.shop_name || "");
        setGst(me.gst || "");
        setDrugLic(me.drug_license || "");
        setFoodLic(me.food_license || "");
        setAddress(me.address || "");
        setEmail(me.email || "");
      } catch (e: any) {
        showError(e?.message || "Could not load profile", "Load failed");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Your name is required";
    else if (name.trim().length < 2) e.name = "Name must be at least 2 characters";

    if (!phone.trim()) e.phone = "Phone number is required";
    else if (!/^\d{10}$/.test(phone.trim())) e.phone = "Enter a valid 10-digit phone";
    else if (!/^[6-9]/.test(phone.trim())) e.phone = "Indian mobile must start with 6, 7, 8 or 9";

    if (gst.trim() && !GST_RX.test(gst.trim())) e.gst = "Invalid GSTIN format (e.g., 27ABCDE1234F1Z5)";
    if (drugLic.trim() && !DL_RX.test(drugLic.trim())) e.drug_license = "Invalid Drug License";
    if (foodLic.trim() && !FSSAI_RX.test(foodLic.trim())) e.food_license = "FSSAI must be 14 digits";

    return e;
  }, [name, phone, gst, drugLic, foodLic]);

  const valid = !errors.name && !errors.phone && !errors.gst && !errors.drug_license && !errors.food_license;

  const markTouched = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  const save = async () => {
    setTouched({ name: true, phone: true, gst: true, drug_license: true, food_license: true });
    if (!valid) {
      showError(errors.name || errors.phone || errors.gst || errors.drug_license || errors.food_license || "Please fix the highlighted fields", "Cannot save");
      return;
    }
    setSaving(true);
    try {
      await api("/auth/profile", {
        method: "PATCH",
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
      showSuccess("Profile updated", "Saved");
      router.back();
    } catch (e: any) {
      if (e?.fields && Object.keys(e.fields).length) {
        setTouched((t) => ({ ...t, ...Object.fromEntries(Object.keys(e.fields).map((k) => [k, true])) }));
      }
      showError(e?.message || "Could not update profile", "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Profile & Shop Info" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar title="Profile & Shop Info" showBack />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          <View style={styles.emailBadge}>
            <Text style={styles.emailLabel}>Email (cannot change)</Text>
            <Text style={styles.emailValue}>{email}</Text>
          </View>

          <Field
            label="Your name *"
            value={name}
            onChange={setName}
            onBlur={() => markTouched("name")}
            error={touched.name ? errors.name : undefined}
            testID="profile-name"
          />
          <Field
            label="Phone number *"
            value={phone}
            onChange={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
            onBlur={() => markTouched("phone")}
            keyboardType="phone-pad"
            error={touched.phone ? errors.phone : undefined}
            testID="profile-phone"
          />
          <Field label="Shop name" value={shopName} onChange={setShopName} testID="profile-shop" />
          <Field
            label="GST number"
            value={gst}
            onChange={(v) => setGst(v.toUpperCase().slice(0, 15))}
            onBlur={() => markTouched("gst")}
            error={touched.gst ? errors.gst : undefined}
            hint={!touched.gst || !errors.gst ? "Optional — 15-character GSTIN" : undefined}
            testID="profile-gst"
            autoCapitalize="characters"
          />
          <Field
            label="Drug License No."
            value={drugLic}
            onChange={(v) => setDrugLic(v.toUpperCase().slice(0, 30))}
            onBlur={() => markTouched("drug_license")}
            error={touched.drug_license ? errors.drug_license : undefined}
            hint={!touched.drug_license || !errors.drug_license ? "Optional — Form 20/21B license" : undefined}
            testID="profile-drug-lic"
            autoCapitalize="characters"
          />
          <Field
            label="FSSAI / Food License"
            value={foodLic}
            onChange={(v) => setFoodLic(v.replace(/\D/g, "").slice(0, 14))}
            onBlur={() => markTouched("food_license")}
            keyboardType="number-pad"
            error={touched.food_license ? errors.food_license : undefined}
            hint={!touched.food_license || !errors.food_license ? "Optional — 14-digit FSSAI" : undefined}
            testID="profile-food-lic"
          />
          <Field
            label="Shop address"
            value={address}
            onChange={setAddress}
            multiline
            testID="profile-address"
          />

          <View style={{ height: 20 }} />
          <Button title="Save Changes" onPress={save} loading={saving} disabled={!valid} fullWidth testID="profile-save" />
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
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        placeholderTextColor={colors.textTertiary}
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
  emailBadge: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  emailLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },
  emailValue: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 2 },
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    height: 50,
    fontSize: 15,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerBg + "40" },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  errorText: { fontSize: 11.5, color: colors.danger, fontWeight: "600" },
  hint: { fontSize: 11, color: colors.textTertiary, marginTop: 6, fontWeight: "500" },
});
