import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { colors, radius } from "@/src/theme";

export default function Profile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [shopName, setShopName] = useState("");
  const [gst, setGst] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me: any = await api("/auth/me");
        setName(me.name || "");
        setPhone(me.phone || "");
        setShopName(me.shop_name || "");
        setGst(me.gst || "");
        setAddress(me.address || "");
        setEmail(me.email || "");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    if (name.trim().length < 2) {
      Alert.alert("Name required");
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      Alert.alert("Enter a valid 10-digit phone");
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
          address: address.trim(),
        },
      });
      Alert.alert("Saved", "Profile updated", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert("Error", e.message);
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

          <Field label="Your name *" value={name} onChange={setName} testID="profile-name" />
          <Field
            label="Phone number *"
            value={phone}
            onChange={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
            keyboardType="phone-pad"
            testID="profile-phone"
          />
          <Field label="Shop name" value={shopName} onChange={setShopName} testID="profile-shop" />
          <Field label="GST number" value={gst} onChange={(v) => setGst(v.toUpperCase())} testID="profile-gst" />
          <Field
            label="Shop address"
            value={address}
            onChange={setAddress}
            multiline
            testID="profile-address"
          />

          <View style={{ height: 20 }} />
          <Button title="Save Changes" onPress={save} loading={saving} fullWidth testID="profile-save" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboardType,
  multiline,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: any;
  multiline?: boolean;
  testID?: string;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { height: 80, paddingTop: 14 }]}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        placeholderTextColor={colors.textTertiary}
        testID={testID}
      />
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
});
