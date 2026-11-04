// Shows an uploaded photo or plays an uploaded voice note (token-authed URL).
import { useEffect, useState } from "react";
import { Image, TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { fileUrl } from "@/src/api";
import { colors, radius } from "@/src/theme";

function useFileUrl(id?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (id) fileUrl(id).then(setUrl);
  }, [id]);
  return url;
}

export function FileImage({ id, size = 72 }: { id: string; size?: number }) {
  const url = useFileUrl(id);
  if (!url) return <View style={[styles.ph, { width: size, height: size }]} />;
  return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted }} />;
}

function Player({ url }: { url: string }) {
  const player = useAudioPlayer({ uri: url });
  const st = useAudioPlayerStatus(player);
  const toggle = () => {
    if (st.playing) player.pause();
    else {
      if (st.didJustFinish || (st.duration && st.currentTime >= st.duration)) player.seekTo(0);
      player.play();
    }
  };
  return (
    <TouchableOpacity style={styles.play} onPress={toggle} testID="play-voice">
      <Ionicons name={st.playing ? "pause" : "play"} size={16} color={colors.primary} />
      <Text style={styles.playText}>{st.playing ? "Pause voice note" : "Play voice note"}</Text>
    </TouchableOpacity>
  );
}

export function VoicePlayer({ id }: { id: string }) {
  const url = useFileUrl(id);
  return url ? <Player url={url} /> : null;
}

const styles = StyleSheet.create({
  ph: { borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  play: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, height: 36, borderRadius: radius.pill, backgroundColor: colors.primaryBg },
  playText: { color: colors.primary, fontWeight: "700", fontSize: 12 },
});
