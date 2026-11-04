// Attach up to N photos (camera or gallery) → uploaded to storage, returns file ids.
import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { apiBase, authToken } from "@/src/api";
import { uploadForm } from "@/src/utils/upload";
import { colors, radius } from "@/src/theme";

export type Photo = { id: string; uri: string };
type Props = { photos: Photo[]; onChange: (p: Photo[]) => void; max?: number; testID?: string };

export function PhotoAttach({ photos, onChange, max = 3, testID = "photo-attach" }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const upload = async (asset: ImagePicker.ImagePickerAsset) => {
    const token = await authToken();
    const r = await uploadForm(`${apiBase}/uploads`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      files: { file: { uri: asset.uri, name: asset.fileName || "photo.jpg", mimeType: asset.mimeType || "image/jpeg" } },
    });
    onChange([...photos, { id: r.id, uri: asset.uri }]);
  };

  const pick = async (camera: boolean) => {
    setErr(null);
    try {
      if (camera && Platform.OS !== "web") {
        const cur = await ImagePicker.getCameraPermissionsAsync();
        if (!cur.granted) {
          if (!cur.canAskAgain) return setBlocked(true);
          const r = await ImagePicker.requestCameraPermissionsAsync();
          if (!r.granted) {
            setBlocked(!r.canAskAgain);
            return setErr("Camera access lets you snap the damaged / wrong item.");
          }
        }
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.5 };
      const res = camera && Platform.OS !== "web" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return;
      setBusy(true);
      await upload(res.assets[0]);
    } catch (e: any) {
      setErr(e?.message || "Photo upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID={testID}>
      <View style={styles.row}>
        {photos.map((p) => (
          <View key={p.id} style={styles.thumbWrap}>
            <Image source={{ uri: p.uri }} style={styles.thumb} />
            <TouchableOpacity style={styles.remove} onPress={() => onChange(photos.filter((x) => x.id !== p.id))} hitSlop={8}>
              <Ionicons name="close" size={12} color="#FFF" />
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < max && (
          <>
            {Platform.OS !== "web" && (
              <TouchableOpacity style={styles.add} onPress={() => pick(true)} disabled={busy} testID={`${testID}-camera`}>
                <Ionicons name="camera-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.addText}>Camera</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.add} onPress={() => pick(false)} disabled={busy} testID={`${testID}-gallery`}>
              {busy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="image-outline" size={20} color={colors.textSecondary} />}
              <Text style={styles.addText}>{busy ? "Uploading" : "Photo"}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
      {!!err && <Text style={styles.err}>{err}</Text>}
      {blocked && (
        <TouchableOpacity onPress={() => Linking.openSettings()} style={{ marginTop: 6, minHeight: 32 }}>
          <Text style={styles.link}>Open Settings to allow camera</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  thumbWrap: { width: 64, height: 64 },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  remove: { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  add: { width: 64, height: 64, borderRadius: radius.sm, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", gap: 2 },
  addText: { fontSize: 10, color: colors.textSecondary, fontWeight: "700" },
  err: { color: colors.danger, fontSize: 12, marginTop: 6 },
  link: { color: colors.primary, fontWeight: "700", fontSize: 12 },
});
