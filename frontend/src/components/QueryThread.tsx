// Shared query (flag) ticket detail: returned items, linked order/bill, full message history.
// Used by the pharmacy (My Queries) and the distributor (Query Management).
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FileImage, VoicePlayer } from "@/src/components/FileMedia";
import { TYPE_LABEL } from "@/src/utils/queryLabels";
import { colors, radius, formatINRFull } from "@/src/theme";

function when(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
  } catch { return ""; }
}

type Props = { q: any; side: "customer" | "distributor"; onOpenOrder?: (orderId: string) => void };

export function QueryThread({ q, side, onOpenOrder }: Props) {
  const orderId = q.order_id || q.linked_order_id;
  const acts: any[] = q.activities || [];
  return (
    <View>
      <Text style={styles.title}>{q.title}</Text>
      <Text style={styles.meta}>
        {q.code} · {TYPE_LABEL[q.type] || q.type} · {side === "distributor" ? q.customer_name : q.distributor_name}
      </Text>
      {(!!q.bill_numbers?.length || q.mode) && (
        <Text style={styles.meta}>
          {q.bill_numbers?.length ? `Bill ${q.bill_numbers.join(", ")}` : ""}
          {q.mode ? `${q.bill_numbers?.length ? " · " : ""}${q.mode === "sellable" ? "Sellable (fully paid)" : "Issue (part / unpaid)"}` : ""}
        </Text>
      )}

      {!!orderId && onOpenOrder && (
        <TouchableOpacity style={styles.link} onPress={() => onOpenOrder(orderId)} testID="query-open-order">
          <Ionicons name="receipt-outline" size={16} color={colors.primary} />
          <Text style={styles.linkText}>Open order {q.linked_order_code || ""}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </TouchableOpacity>
      )}

      {!!q.items?.length && (
        <View style={styles.items}>
          <Text style={styles.section}>Products to return</Text>
          {q.items.map((it: any, i: number) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName} numberOfLines={1}>{it.name}{it.batch ? ` · ${it.batch}` : ""}</Text>
              <Text style={styles.itemQty}>× {it.qty}</Text>
              <Text style={styles.itemAmt}>{formatINRFull(it.amount || 0)}</Text>
            </View>
          ))}
        </View>
      )}

      {!!q.description && <Text style={styles.desc}>{q.description}</Text>}
      {(q.photo_file_ids?.length > 0 || q.audio_file_id) && (
        <View style={styles.media}>
          {(q.photo_file_ids || []).map((id: string) => <FileImage key={id} id={id} size={72} />)}
          {!!q.audio_file_id && <VoicePlayer id={q.audio_file_id} />}
        </View>
      )}
      {!!q.resolution && <Text style={styles.resolution}>Resolution: {q.resolution}</Text>}

      <Text style={styles.section}>History</Text>
      {acts.map((a, i) => {
        const mine = a.by === side;
        const isStatus = a.kind === "status" || a.text === "Query raised" || (a.text || "").startsWith("Status →");
        if (isStatus) {
          return (
            <View key={i} style={styles.event}>
              <Text style={styles.eventText}>{a.text} · {when(a.at)}</Text>
            </View>
          );
        }
        return (
          <View key={i} style={[styles.bubble, mine ? styles.mine : styles.theirs]} testID={`thread-msg-${i}`}>
            <Text style={styles.author}>{a.by === "customer" ? (a.author || "Pharmacy") : (a.author || "Distributor")}</Text>
            <Text style={styles.msg}>{a.text}</Text>
            {!!a.photo_file_ids?.length && (
              <View style={styles.media}>
                {a.photo_file_ids.map((id: string) => <FileImage key={id} id={id} size={64} />)}
              </View>
            )}
            <Text style={styles.time}>{when(a.at)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: "800", color: colors.text, fontSize: 17 },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  link: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingHorizontal: 12, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryBg },
  linkText: { flex: 1, color: colors.primary, fontWeight: "800", fontSize: 13 },
  items: { marginTop: 12, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  section: { fontSize: 11.5, fontWeight: "800", color: colors.textSecondary, marginTop: 14, marginBottom: 6, letterSpacing: 0.3 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  itemName: { flex: 1, color: colors.text, fontWeight: "700", fontSize: 13 },
  itemQty: { color: colors.textSecondary, fontWeight: "700", fontSize: 13 },
  itemAmt: { color: colors.text, fontWeight: "800", fontSize: 13, minWidth: 70, textAlign: "right" },
  desc: { color: colors.text, fontSize: 13.5, marginTop: 10, lineHeight: 19, backgroundColor: colors.surface, padding: 12, borderRadius: 10 },
  media: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" },
  resolution: { color: colors.success, fontSize: 12.5, marginTop: 10, fontWeight: "700" },
  event: { alignSelf: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surface, marginVertical: 4 },
  eventText: { fontSize: 11, color: colors.textSecondary, fontWeight: "600" },
  bubble: { maxWidth: "85%", padding: 10, borderRadius: 12, marginVertical: 4 },
  mine: { alignSelf: "flex-end", backgroundColor: colors.primaryBg },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.surface },
  author: { fontSize: 10.5, fontWeight: "800", color: colors.textSecondary, marginBottom: 2 },
  msg: { fontSize: 13.5, color: colors.text, lineHeight: 19 },
  time: { fontSize: 10, color: colors.textTertiary, marginTop: 4, alignSelf: "flex-end" },
});
