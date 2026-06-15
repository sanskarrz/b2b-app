// Distributor → Customer detail: credit management, ledger, collections, notes
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal, Pressable, Linking } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/src/api";
import { shareCustomerStatement } from "@/src/utils/statement";
import { showError, showSuccess } from "@/src/components/Toast";
import { colors, radius, formatINR, formatINRFull } from "@/src/theme";

const METHODS = ["cash", "upi", "cheque", "neft"];
const CN_REASONS = ["damaged", "expired", "return-refund", "scheme-adjust", "settlement", "other"];

export default function DistributorCustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // modals
  const [editCredit, setEditCredit] = useState(false);
  const [limit, setLimit] = useState("");
  const [recordInv, setRecordInv] = useState<any | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [noteMode, setNoteMode] = useState<null | "credit" | "debit">(null);
  const [noteAmount, setNoteAmount] = useState("");
  const [noteReason, setNoteReason] = useState("damaged");
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  const shareStatement = async () => {
    setSharing(true);
    try {
      const r = await shareCustomerStatement(String(id));
      if (r.reason === "printed") showSuccess("Statement opened — use your browser to Save as PDF");
    } catch (e: any) {
      showError(e?.message || "Could not generate statement", "Statement failed");
    } finally {
      setSharing(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api(`/distributor/me/customers/${id}`);
      setData(d);
    } catch (e: any) {
      showError(e?.message || "Could not load customer", "Load failed");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveCredit = async () => {
    const lim = parseInt(limit, 10);
    if (isNaN(lim) || lim < 0) { showError("Enter a valid limit"); return; }
    setSaving(true);
    try {
      await api(`/distributor/me/customers/${id}/credit`, { method: "PATCH", body: { credit_limit: lim } });
      showSuccess("Credit limit updated");
      setEditCredit(false);
      await load();
    } catch (e: any) { showError(e?.message || "Failed", "Update failed"); }
    finally { setSaving(false); }
  };

  const record = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { showError("Enter a valid amount"); return; }
    setSaving(true);
    try {
      const r = await api(`/distributor/payments/${recordInv.id}/record`, { method: "POST", body: { amount: amt, method } });
      showSuccess(r.fully_paid ? "Invoice settled" : `₹${amt} collected`);
      setRecordInv(null);
      await load();
    } catch (e: any) { showError(e?.message || "Failed", "Could not record"); }
    finally { setSaving(false); }
  };

  const issueNote = async () => {
    const amt = parseFloat(noteAmount);
    if (!amt || amt <= 0) { showError("Enter a valid amount"); return; }
    setSaving(true);
    try {
      const ep = noteMode === "credit" ? "credit-note" : "debit-note";
      await api(`/distributor/me/customers/${id}/${ep}`, { method: "POST", body: { amount: amt, reason: noteReason, notes: noteText || null } });
      showSuccess(`${noteMode === "credit" ? "Credit" : "Debit"} note issued`);
      setNoteMode(null); setNoteAmount(""); setNoteText("");
      await load();
    } catch (e: any) { showError(e?.message || "Failed", "Could not issue"); }
    finally { setSaving(false); }
  };

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Header onBack={() => router.back()} />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const c = data.customer;
  const cr = data.credit;
  const st = data.stats;
  const phone = (c.phone || "").replace(/\D/g, "");
  const usedPct = cr.credit_used_pct || 0;
  const barColor = usedPct >= 85 ? colors.danger : usedPct >= 60 ? colors.warning : colors.success;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <LinearGradient colors={[colors.primarySoft, colors.primary]} style={styles.hero}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(c.name || "?")[0]?.toUpperCase()}</Text></View>
          <Text style={styles.heroName}>{c.name}</Text>
          <Text style={styles.heroSub}>{c.contact_name ? `${c.contact_name} • ` : ""}{c.phone || c.email}</Text>
          <View style={styles.actionPills}>
            {!!phone && <Pill icon="call" label="Call" onPress={() => Linking.openURL(`tel:${c.phone}`)} />}
            {!!phone && <Pill icon="logo-whatsapp" label="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${phone}`)} />}
            <Pill icon="chatbubble-ellipses" label="Chat" onPress={() => router.push(`/d/messages/${id}`)} />
          </View>
        </LinearGradient>

        {/* Credit card */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Credit Line</Text>
            <TouchableOpacity style={styles.editBtn} onPress={() => { setLimit(String(cr.credit_limit)); setEditCredit(true); }} testID="edit-credit">
              <Ionicons name="create-outline" size={14} color={colors.primary} />
              <Text style={styles.editBtnText}>Edit limit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.creditRow}>
            <View><Text style={styles.creditLabel}>USED</Text><Text style={[styles.creditVal, { color: barColor }]}>{formatINRFull(cr.credit_used)}</Text></View>
            <View style={{ alignItems: "flex-end" }}><Text style={styles.creditLabel}>AVAILABLE</Text><Text style={[styles.creditVal, { color: colors.success }]}>{formatINRFull(cr.credit_available)}</Text></View>
          </View>
          <View style={styles.barBg}><View style={[styles.barFill, { width: `${Math.min(usedPct, 100)}%`, backgroundColor: barColor }]} /></View>
          <Text style={styles.creditMeta}>{usedPct}% of {formatINRFull(cr.credit_limit)} limit • {cr.credit_days}d terms • {cr.settlement_discount_pct}% early-settle</Text>
        </View>

        {/* Share account statement (WhatsApp / Email / etc.) */}
        <TouchableOpacity style={styles.statementBtn} onPress={shareStatement} disabled={sharing} testID="share-statement">
          {sharing ? <ActivityIndicator color="#FFF" /> : (
            <>
              <Ionicons name="logo-whatsapp" size={17} color="#FFF" />
              <Text style={styles.statementBtnText}>Share Account Statement</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Business stats */}
        <View style={styles.statsGrid}>
          <Stat label="Lifetime" value={formatINR(st.total_spent)} />
          <Stat label="Orders" value={String(st.order_count)} />
          <Stat label="Outstanding" value={formatINR(st.outstanding)} danger={st.outstanding > 0} />
          <Stat label="Overdue" value={formatINR(st.overdue)} danger={st.overdue > 0} />
        </View>

        {/* Quick note actions */}
        <View style={styles.noteActions}>
          <TouchableOpacity style={[styles.noteBtn, { backgroundColor: colors.successBg }]} onPress={() => { setNoteMode("credit"); setNoteReason("damaged"); }} testID="credit-note-btn">
            <Ionicons name="add-circle" size={16} color={colors.success} />
            <Text style={[styles.noteBtnText, { color: colors.success }]}>Credit Note</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.noteBtn, { backgroundColor: colors.dangerBg }]} onPress={() => { setNoteMode("debit"); setNoteReason("other"); }} testID="debit-note-btn">
            <Ionicons name="remove-circle" size={16} color={colors.danger} />
            <Text style={[styles.noteBtnText, { color: colors.danger }]}>Debit Note</Text>
          </TouchableOpacity>
        </View>

        {/* Open invoices */}
        {data.open_invoices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Open Invoices ({data.open_invoices.length})</Text>
            {data.open_invoices.map((p: any) => (
              <View key={p.id} style={[styles.invRow, p.status === "overdue" && { borderLeftWidth: 3, borderLeftColor: colors.danger }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invCode}>{p.invoice_code}</Text>
                  <Text style={[styles.invStatus, { color: p.status === "overdue" ? colors.danger : colors.warning }]}>{p.status.toUpperCase()}</Text>
                </View>
                <Text style={styles.invAmount}>{formatINRFull(p.amount)}</Text>
                <TouchableOpacity style={styles.collectBtn} onPress={() => { setRecordInv(p); setAmount(String(Math.round(p.amount))); setMethod("cash"); }} testID="collect-open">
                  <Text style={styles.collectText}>Collect</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Ledger */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ledger</Text>
          {data.entries.length === 0 ? (
            <Text style={styles.emptyText}>No transactions yet</Text>
          ) : (
            [...data.entries].reverse().map((e: any) => {
              const isCredit = e.credit > 0;
              return (
                <View key={e.id} style={styles.ledgerRow}>
                  <View style={[styles.ledgerIcon, { backgroundColor: isCredit ? colors.successBg : colors.surface }]}>
                    <Ionicons name={ICONS[e.type] || "document-text"} size={14} color={isCredit ? colors.success : colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ledgerLabel} numberOfLines={1}>{e.label}</Text>
                    <Text style={styles.ledgerDate}>{new Date(e.date).toLocaleDateString()} • Bal {formatINR(e.running_balance)}</Text>
                  </View>
                  <Text style={[styles.ledgerAmt, { color: isCredit ? colors.success : colors.text }]}>
                    {isCredit ? "+" : "−"}{formatINRFull(isCredit ? e.credit : e.debit)}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Edit credit modal */}
      <BottomModal visible={editCredit} onClose={() => setEditCredit(false)} title="Edit Credit Limit" sub={`${c.name} • currently ${formatINRFull(cr.credit_limit)}`}>
        <Text style={styles.fieldLabel}>New credit limit (₹)</Text>
        <TextInput value={limit} onChangeText={(v) => setLimit(v.replace(/\D/g, ""))} keyboardType="number-pad" style={styles.input} />
        <ModalActions onCancel={() => setEditCredit(false)} onSave={saveCredit} saving={saving} label="Save" />
      </BottomModal>

      {/* Record payment modal */}
      <BottomModal visible={!!recordInv} onClose={() => setRecordInv(null)} title="Record Payment" sub={recordInv ? `${recordInv.invoice_code} • ${formatINRFull(recordInv.amount)} due` : ""}>
        <Text style={styles.fieldLabel}>Amount received (₹)</Text>
        <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" style={styles.input} />
        <Text style={styles.fieldLabel}>Method</Text>
        <View style={styles.chipWrap}>
          {METHODS.map((m) => (
            <TouchableOpacity key={m} style={[styles.smallChip, method === m && styles.smallChipActive]} onPress={() => setMethod(m)}>
              <Text style={[styles.smallChipText, method === m && { color: "#FFF" }]}>{m.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <ModalActions onCancel={() => setRecordInv(null)} onSave={record} saving={saving} label="Collect" />
      </BottomModal>

      {/* Note modal */}
      <BottomModal visible={!!noteMode} onClose={() => setNoteMode(null)} title={noteMode === "credit" ? "Issue Credit Note" : "Issue Debit Note"} sub={c.name}>
        <Text style={styles.fieldLabel}>Amount (₹)</Text>
        <TextInput value={noteAmount} onChangeText={(v) => setNoteAmount(v.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" style={styles.input} />
        <Text style={styles.fieldLabel}>Reason</Text>
        <View style={styles.chipWrap}>
          {CN_REASONS.map((r) => (
            <TouchableOpacity key={r} style={[styles.smallChip, noteReason === r && styles.smallChipActive]} onPress={() => setNoteReason(r)}>
              <Text style={[styles.smallChipText, noteReason === r && { color: "#FFF" }]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Notes (optional)</Text>
        <TextInput value={noteText} onChangeText={setNoteText} style={[styles.input, { height: 60 }]} multiline placeholder="e.g. 2 strips broken in transit" placeholderTextColor={colors.textTertiary} />
        <ModalActions onCancel={() => setNoteMode(null)} onSave={issueNote} saving={saving} label="Issue" />
      </BottomModal>
    </SafeAreaView>
  );
}

const ICONS: any = { bill: "receipt", payment: "cash", credit_note: "arrow-undo", debit_note: "arrow-redo" };

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.topbar}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
      <Text style={styles.topbarTitle}>Customer</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}
function Pill({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.pill} onPress={onPress}>
      <Ionicons name={icon} size={15} color="#FFF" />
      <Text style={styles.pillText}>{label}</Text>
    </TouchableOpacity>
  );
}
function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statCardLabel}>{label}</Text>
      <Text style={[styles.statCardVal, danger && { color: colors.danger }]}>{value}</Text>
    </View>
  );
}
function BottomModal({ visible, onClose, title, sub, children }: any) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBg} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{title}</Text>
          {!!sub && <Text style={styles.modalSub}>{sub}</Text>}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
function ModalActions({ onCancel, onSave, saving, label }: any) {
  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
      <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={onSave} disabled={saving} testID="modal-save">
        {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>{label}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surface },
  topbarTitle: { fontWeight: "800", color: colors.text, fontSize: 16 },

  hero: { alignItems: "center", padding: 18, paddingTop: 10, paddingBottom: 20, marginHorizontal: 12, borderRadius: radius.lg },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFF", fontWeight: "800", fontSize: 22 },
  heroName: { color: "#FFF", fontWeight: "800", fontSize: 18, marginTop: 8 },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 3 },
  actionPills: { flexDirection: "row", gap: 8, marginTop: 14 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  pillText: { color: "#FFF", fontWeight: "700", fontSize: 12 },

  card: { backgroundColor: "#FFF", marginHorizontal: 12, marginTop: 12, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontWeight: "800", color: colors.text, fontSize: 14 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primaryBg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  editBtnText: { color: colors.primary, fontWeight: "800", fontSize: 11 },
  creditRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  creditLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  creditVal: { fontSize: 18, fontWeight: "800", marginTop: 3, letterSpacing: -0.3 },
  barBg: { height: 8, backgroundColor: colors.surface, borderRadius: 999, marginTop: 12, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 999 },
  creditMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 8 },

  statementBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 12, marginTop: 12, paddingVertical: 13, borderRadius: radius.md, backgroundColor: "#25D366" },
  statementBtnText: { color: "#FFF", fontWeight: "800", fontSize: 14 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, marginTop: 12 },
  statCard: { flexGrow: 1, flexBasis: "47%", backgroundColor: "#FFF", padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  statCardLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  statCardVal: { color: colors.text, fontWeight: "800", fontSize: 16, marginTop: 4 },

  noteActions: { flexDirection: "row", gap: 8, paddingHorizontal: 12, marginTop: 12 },
  noteBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 11, borderRadius: radius.md },
  noteBtnText: { fontWeight: "800", fontSize: 13 },

  section: { marginTop: 16, paddingHorizontal: 12 },
  sectionTitle: { fontWeight: "800", color: colors.text, fontSize: 14, marginBottom: 10 },
  invRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  invCode: { fontWeight: "800", color: colors.text, fontSize: 13 },
  invStatus: { fontSize: 10, fontWeight: "800", marginTop: 2, letterSpacing: 0.3 },
  invAmount: { fontWeight: "800", color: colors.text, fontSize: 14 },
  collectBtn: { backgroundColor: colors.success, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  collectText: { color: "#FFF", fontWeight: "800", fontSize: 11 },

  ledgerRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, marginBottom: 6 },
  ledgerIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  ledgerLabel: { fontWeight: "700", color: colors.text, fontSize: 12.5 },
  ledgerDate: { color: colors.textSecondary, fontSize: 10.5, marginTop: 2 },
  ledgerAmt: { fontWeight: "800", fontSize: 13 },
  emptyText: { color: colors.textSecondary, fontSize: 13 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.bg, padding: 18, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  modalHandle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 999, alignSelf: "center", marginBottom: 14 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  modalSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", marginTop: 12, marginBottom: 5 },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: colors.text, fontWeight: "600" },
  chipWrap: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  smallChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  smallChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  smallChipText: { color: colors.textSecondary, fontWeight: "700", fontSize: 11 },
  cancelBtn: { flex: 1, alignItems: "center", padding: 13, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cancelText: { color: colors.text, fontWeight: "700" },
  saveBtn: { flex: 2, alignItems: "center", justifyContent: "center", padding: 13, borderRadius: 10, backgroundColor: colors.primary },
  saveText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
});
