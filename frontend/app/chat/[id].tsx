// 1-on-1 chat thread with a distributor (attach-order capability)
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator,
  KeyboardAvoidingView, Platform, Modal, ScrollView, Linking,
} from "react-native";
import { useState, useEffect, useRef, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { TopBar } from "@/src/components/TopBar";
import { api } from "@/src/api";
import { colors, radius, formatINRFull } from "@/src/theme";

function timeLabel(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export default function ChatThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [attachOrderId, setAttachOrderId] = useState<string | null>(null);
  const [attachedOrder, setAttachedOrder] = useState<any>(null);
  const [orderModal, setOrderModal] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api(`/chat/${id}`);
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openOrderPicker = async () => {
    try {
      const list = await api(`/orders`);
      setOrders(list.filter((o: any) => o.distributor_id === id));
      setOrderModal(true);
    } catch {}
  };

  const pickOrder = (o: any) => {
    setAttachOrderId(o.id);
    setAttachedOrder(o);
    setOrderModal(false);
  };

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api("/chat", {
        method: "POST",
        body: { distributor_id: id, message: text.trim(), attach_order_id: attachOrderId },
      });
      setText("");
      setAttachOrderId(null);
      setAttachedOrder(null);
      await load();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 200);
    } finally {
      setSending(false);
    }
  };

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <TopBar title="Chat" showBack />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const dist = data.distributor;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <TopBar
        title={dist.short_name}
        subtitle={`⭐ ${dist.rating} • ${dist.delivery_time}`}
        showBack
        rightIcons={[
          { name: "receipt-outline", onPress: () => router.push(`/ledger/${id}`), testID: "chat-ledger" },
          { name: "call-outline", onPress: () => Linking.openURL("tel:+912266660000"), testID: "chat-call" },
          { name: "logo-whatsapp", onPress: () => Linking.openURL(`https://wa.me/919876543210?text=Hi%20${encodeURIComponent(dist.short_name)}`), testID: "chat-whatsapp" },
        ]}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={80}>
        <FlatList
          ref={listRef}
          data={data.messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 10 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const fromUser = item.sender === "user";
            return (
              <View style={[styles.msgRow, fromUser ? styles.msgRowRight : styles.msgRowLeft]}>
                {!fromUser && (
                  <View style={styles.msgAvatar}>
                    <Text style={styles.msgAvatarText}>{dist.short_name.charAt(0)}</Text>
                  </View>
                )}
                <View style={[styles.msgBubble, fromUser ? styles.msgBubbleUser : styles.msgBubbleDist]}>
                  {item.attach_order_id && (
                    <TouchableOpacity
                      onPress={() => router.push(`/order/${item.attach_order_id}`)}
                      style={[styles.attachOrderPill, fromUser ? { backgroundColor: "rgba(255,255,255,0.2)" } : { backgroundColor: colors.primaryBg }]}
                    >
                      <Ionicons name="receipt-outline" size={11} color={fromUser ? "#FFF" : colors.primary} />
                      <Text style={[styles.attachOrderText, { color: fromUser ? "#FFF" : colors.primary }]}>Order attached</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={[styles.msgText, fromUser ? styles.msgTextUser : styles.msgTextDist]}>{item.message}</Text>
                  <Text style={[styles.msgTime, fromUser ? styles.msgTimeUser : styles.msgTimeDist]}>{timeLabel(item.created_at)}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 40, gap: 8 }}>
              <Ionicons name="chatbubbles-outline" size={36} color={colors.textTertiary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Say hello to {dist.short_name}</Text>
            </View>
          }
        />

        {/* Attached order preview */}
        {attachedOrder && (
          <View style={styles.attachPreview}>
            <Ionicons name="receipt" size={14} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.attachPreviewLabel}>Attaching order</Text>
              <Text style={styles.attachPreviewVal}>{attachedOrder.code} • {formatINRFull(attachedOrder.total)}</Text>
            </View>
            <TouchableOpacity onPress={() => { setAttachOrderId(null); setAttachedOrder(null); }}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Composer */}
        <View style={styles.composer}>
          <TouchableOpacity style={styles.attachBtn} onPress={openOrderPicker} testID="chat-attach">
            <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type a message..."
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            multiline
            testID="chat-input"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
            onPress={send}
            disabled={!text.trim() || sending}
            testID="chat-send"
          >
            <Ionicons name="send" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Order picker modal */}
      <Modal visible={orderModal} animationType="slide" onRequestClose={() => setOrderModal(false)} transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Attach an order</Text>
              <TouchableOpacity onPress={() => setOrderModal(false)}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            {orders.length === 0 ? (
              <Text style={styles.modalEmpty}>No orders with {dist.short_name} yet.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                {orders.map((o) => (
                  <TouchableOpacity key={o.id} style={styles.orderPick} onPress={() => pickOrder(o)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderPickCode}>{o.code}</Text>
                      <Text style={styles.orderPickMeta}>{o.sku_count} items • {o.status}</Text>
                    </View>
                    <Text style={styles.orderPickAmt}>{formatINRFull(o.total)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  msgRow: { flexDirection: "row", marginBottom: 8, gap: 6 },
  msgRowLeft: { justifyContent: "flex-start" },
  msgRowRight: { justifyContent: "flex-end" },
  msgAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
    alignSelf: "flex-end",
  },
  msgAvatarText: { color: colors.primary, fontWeight: "800", fontSize: 11 },
  msgBubble: { maxWidth: "75%", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 16 },
  msgBubbleUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  msgBubbleDist: { backgroundColor: colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  msgText: { fontSize: 13.5, lineHeight: 19 },
  msgTextUser: { color: "#FFF" },
  msgTextDist: { color: colors.text },
  msgTime: { fontSize: 9, marginTop: 4, textAlign: "right" },
  msgTimeUser: { color: "rgba(255,255,255,0.7)" },
  msgTimeDist: { color: colors.textTertiary },
  attachOrderPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  attachOrderText: { fontSize: 10, fontWeight: "700" },

  attachPreview: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 10, marginHorizontal: 12,
    backgroundColor: colors.primaryBg,
    borderRadius: 10,
    borderWidth: 1, borderColor: colors.primary,
    marginBottom: 6,
  },
  attachPreviewLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: "700" },
  attachPreviewVal: { fontSize: 13, color: colors.text, fontWeight: "800", marginTop: 1 },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: 14,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: "#FFF",
  },
  attachBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 30 },
  modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  modalEmpty: { textAlign: "center", color: colors.textSecondary, fontSize: 13, padding: 30 },
  orderPick: {
    flexDirection: "row", alignItems: "center",
    padding: 12, marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 10, borderWidth: 1, borderColor: colors.border,
  },
  orderPickCode: { fontWeight: "800", color: colors.text, fontSize: 14 },
  orderPickMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  orderPickAmt: { fontSize: 14, fontWeight: "800", color: colors.primary },
});
