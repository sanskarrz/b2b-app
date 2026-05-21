import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TouchableOpacity,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { colors } from "@/src/theme";

export default function Onboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [shopName, setShopName] = useState("");
  const [gst, setGst] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);

  const valid = name.trim().length >= 2 && /^\d{10}$/.test(phone.trim());

  const onSubmit = async () => {
    if (!valid) return;
    setLoading(true);
    try {
      await api("/auth/onboard", {
        method: "POST",
        body: {
          name: name.trim(),
          phone: phone.trim(),
          shop_name: shopName.trim(),
          gst: gst.trim(),
          address: address.trim(),
        },
      });
      router.replace("/(tabs)/home");
    } catch (e: any) {
      Alert.alert("Error", e.message);
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

          <Field label="Your name *" value={name} onChange={setName} placeholder="Dr. Rajesh Kumar" testID="onb-name" />
          <Field
            label="Phone number *"
            value={phone}
            onChange={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
            placeholder="10-digit mobile"
            keyboardType="phone-pad"
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
            onChange={(v) => setGst(v.toUpperCase())}
            placeholder="27ABCDE1234F1Z5"
            testID="onb-gst"
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
  placeholder,
  keyboardType,
  multiline,
  testID,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  multiline?: boolean;
  testID?: string;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { height: 80, paddingTop: 14 }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        testID={testID}
      />
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
});
