// Distributor ↔ Customer 1-on-1 chat
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Linking } from "react-native";
import { useState, useCallback, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError } from "@/src/components/Toast";
import { colors, radius } from "@/src/theme";

export default function DistributorChatThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [customer, setCustomer] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    try {
      const d = await api(`/distributor/me/chat/${id}`);
      setCustomer(d.customer);
      setMessages(d.messages);
    } catch (e: any) {
      showError(e?.message || "Could not load chat", "Load failed");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async () => {
    const msg = text.trim();
    if (!msg) return;
    setSending(true);
    setText("");
    try {
      const r = await api("/distributor/me/chat", { method: "POST", body: { user_id: id, message: msg } });
      setMessages((m) => [...m, r.message]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      showError(e?.message || "Could not send", "Failed");
      setText(msg);
    } finally {
      setSending(false);
    }
  };

  const phone = (customer?.phone || "").replace(/\D/g, "");

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{customer?.name || "Customer"}</Text>
          <Text style={styles.sub}>Customer chat</Text>
        </View>
        {!!phone && <TouchableOpacity onPress={() => Linking.openURL(`tel:${customer.phone}`)} style={styles.iconBtn}><Ionicons name="call" size={18} color={colors.primary} /></TouchableOpacity>}
        {!!phone && <TouchableOpacity onPress={() => Linking.openURL(`https://wa.me/${phone}`)} style={styles.iconBtn}><Ionicons name="logo-whatsapp" size={18} color={colors.success} /></TouchableOpacity>}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m: any) => m.id}
            contentContainerStyle={{ padding: 14, paddingBottom: 14 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item: m }: any) => {
              const mine = m.sender === "distributor";
              return (
                <View style={[styles.bubbleWrap, mine ? styles.right : styles.left]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.bubbleText, mine && { color: "#FFF" }]}>{m.message}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}
        <View style={styles.inputBar}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type a message…"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            multiline
          />
          <TouchableOpacity style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]} onPress={send} disabled={!text.trim() || sending}>
            {sending ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="send" size={18} color="#FFF" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  title: { fontWeight: "800", color: colors.text, fontSize: 15 },
  sub: { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
  bubbleWrap: { marginBottom: 8, maxWidth: "80%" },
  left: { alignSelf: "flex-start" },
  right: { alignSelf: "flex-end" },
  bubble: { padding: 10, borderRadius: 14 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleText: { color: colors.text, fontSize: 14, lineHeight: 19 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "#FFF" },
  input: { flex: 1, maxHeight: 100, backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
});
