// Tap mic → speak → tap stop. Recording is saved AND converted to text.
import { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync } from "expo-audio";
import { apiBase, authToken } from "@/src/api";
import { uploadForm } from "@/src/utils/upload";
import { colors, radius } from "@/src/theme";

type Phase = "idle" | "listening" | "thinking";
type Props = { onResult: (r: { text: string; file_id: string }) => void; testID?: string };

export function VoiceRecorder({ onResult, testID = "voice-btn" }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const busy = useRef(false);
  const watchdog = useRef<any>(null);

  useFocusEffect(
    useCallback(() => () => {
      if (watchdog.current) clearTimeout(watchdog.current);
      try {
        if (recorder.isRecording) recorder.stop().catch(() => {});
      } catch {}
    }, [recorder])
  );

  const ensurePermission = async (): Promise<boolean> => {
    const cur = await AudioModule.getRecordingPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain && cur.status === "denied") {
      setBlocked(true);
      return false;
    }
    const r = await AudioModule.requestRecordingPermissionsAsync();
    if (!r.granted) {
      setBlocked(!r.canAskAgain);
      setErr("Microphone access is needed to record a voice note.");
      return false;
    }
    setBlocked(false);
    return true;
  };

  const stop = async () => {
    if (watchdog.current) clearTimeout(watchdog.current);
    setPhase("thinking");
    try {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) throw new Error("Recording failed — please try again");
      const token = await authToken();
      const name = Platform.OS === "web" ? "voice.webm" : "voice.m4a";
      const r = await uploadForm(`${apiBase}/transcribe`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        files: { audio: { uri, name, mimeType: Platform.OS === "web" ? "audio/webm" : "audio/m4a" } },
      });
      if (r.error) setErr(r.error);
      else if (!r.text) setErr("Didn't catch that — voice saved, you can type the details.");
      onResult({ text: r.text || "", file_id: r.file_id });
    } catch (e: any) {
      setErr(e?.message || "Couldn't save the voice note");
    } finally {
      setPhase("idle");
      busy.current = false;
    }
  };

  const start = async () => {
    if (busy.current) return;
    busy.current = true;
    setErr(null);
    try {
      if (!(await ensurePermission())) {
        busy.current = false;
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase("listening");
      watchdog.current = setTimeout(stop, 120000); // 2-min safety stop
    } catch (e: any) {
      setErr(e?.message || "Couldn't start recording");
      setPhase("idle");
      busy.current = false;
    }
  };

  return (
    <View>
      <TouchableOpacity
        style={[styles.btn, phase === "listening" && styles.btnLive]}
        onPress={phase === "listening" ? stop : start}
        disabled={phase === "thinking"}
        testID={testID}
      >
        {phase === "thinking" ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name={phase === "listening" ? "stop-circle" : "mic"} size={18} color={phase === "listening" ? "#FFF" : colors.primary} />
        )}
        <Text style={[styles.btnText, phase === "listening" && { color: "#FFF" }]}>
          {phase === "listening" ? "Listening… tap to stop" : phase === "thinking" ? "Converting to text…" : "Speak"}
        </Text>
      </TouchableOpacity>
      {phase === "idle" && !err && <Text style={styles.hint}>Speak your note — it{"'"}s saved and typed for you.</Text>}
      {!!err && <Text style={styles.err}>{err}</Text>}
      {blocked && (
        <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.settings} testID="voice-open-settings">
          <Ionicons name="settings-outline" size={14} color={colors.primary} />
          <Text style={styles.settingsText}>Open Settings to allow microphone</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start",
    paddingHorizontal: 14, height: 44, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primaryBg,
  },
  btnLive: { backgroundColor: colors.danger, borderColor: colors.danger },
  btnText: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  hint: { color: colors.textSecondary, fontSize: 11, marginTop: 6 },
  err: { color: colors.danger, fontSize: 12, marginTop: 6, fontWeight: "600" },
  settings: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, minHeight: 32 },
  settingsText: { color: colors.primary, fontWeight: "700", fontSize: 12 },
});
