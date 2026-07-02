// Reusable chat thread view (office ↔ staff). Poll-free; refresh on send + focus.
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useState, useCallback, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { showError } from "@/src/components/Toast";
import { colors, radius } from "@/src/theme";

type Props = {
  title: string;
  loadMessages: () => Promise<any[]>;
  sendMessage: (text: string) => Promise<void>;
  mineWhen: (msg: any) => boolean;
  emptyHint?: string;
};

export function ChatView({ title, loadMessages, sendMessage, mineWhen, emptyHint }: Props) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try { setMsgs(await loadMessages()); }
    catch (e: any) { showError(e?.message || "Could not load chat", "Load failed"); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    setText("");
    try {
      await sendMessage(t);
      await load();
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) { showError(e?.message || "Could not send"); setText(t); }
    finally { setSending(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="chat-back"><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
        <View style={{ width: 36 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : (
          <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 14, paddingBottom: 20 }} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
            {msgs.length === 0 && <Text style={styles.empty}>{emptyHint || "No messages yet. Say hello!"}</Text>}
            {msgs.map((m) => {
              const mine = mineWhen(m);
              return (
                <View key={m.id} style={[styles.bubbleWrap, mine ? styles.mineWrap : styles.theirWrap]}>
                  <View style={[styles.bubble, mine ? styles.mine : styles.their]}>
                    <Text style={[styles.msgText, mine && { color: "#FFF" }]}>{m.text}</Text>
                    <Text style={[styles.time, mine && { color: "rgba(255,255,255,0.7)" }]}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
        <View style={styles.inputBar}>
          <TextInput value={text} onChangeText={setText} placeholder="Type a message…" placeholderTextColor={colors.textTertiary} style={styles.input} multiline testID="chat-input" />
          <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]} onPress={send} disabled={!text.trim() || sending} testID="chat-send">
            {sending ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="send" size={18} color="#FFF" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  topTitle: { flex: 1, textAlign: "center", fontWeight: "800", color: colors.text, fontSize: 16 },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: 40, fontSize: 13 },
  bubbleWrap: { marginBottom: 8, maxWidth: "80%" },
  mineWrap: { alignSelf: "flex-end" },
  theirWrap: { alignSelf: "flex-start" },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  mine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  their: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  msgText: { color: colors.text, fontSize: 14, lineHeight: 19 },
  time: { fontSize: 9.5, color: colors.textTertiary, marginTop: 3, alignSelf: "flex-end" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  input: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100, color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
