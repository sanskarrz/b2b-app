// Distributor Data Sync — import CSV/Excel exports from their billing software
// (file or Google-Drive link, with auto de-dupe) and export our orders back to
// CSV/Excel (Full or "since last export") to import into their system.
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Switch, Platform } from "react-native";
import { useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { showError, showSuccess, showInfo } from "@/src/components/Toast";
import { confirm } from "@/src/components/confirm";
import { colors, radius } from "@/src/theme";

function timeAgo(iso?: string) {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function DataSync() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<any>({});
  const [counts, setCounts] = useState<any>({ product: { count: 0 }, party: { count: 0 }, ledger: { count: 0 } });
  const [logs, setLogs] = useState<any[]>([]);
  const [driveUrl, setDriveUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, d, l] = await Promise.all([
        api("/distributor/me/sync/settings"),
        api("/distributor/me/sync/data"),
        api("/distributor/me/sync/logs"),
      ]);
      setSettings(s); setDriveUrl(s.drive_url || ""); setCounts(d); setLogs(l);
    } catch (e: any) {
      showError(e?.message || "Could not load sync data", "Load failed");
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const reportImport = (r: any) => {
    const s = r.summary || {};
    const parts: string[] = [];
    (["product", "party", "ledger"] as const).forEach((k) => {
      const x = s[k]; if (x && x.found) parts.push(`${x.found} ${k}s (${x.inserted} new, ${x.updated} updated)`);
    });
    showSuccess(parts.length ? `Imported ${parts.join(", ")}` : `Processed ${r.total_rows} rows`, "Import complete");
  };

  const importFile = async () => {
    try {
      const DocumentPicker = await import("expo-document-picker");
      const res = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "*/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      setBusy("import");
      let base64 = "";
      if (Platform.OS === "web") {
        const resp = await fetch(asset.uri); const blob = await resp.blob();
        base64 = await new Promise((resolve) => {
          const fr = new FileReader(); fr.onload = () => resolve(String(fr.result).split(",").pop() || ""); fr.readAsDataURL(blob);
        });
      } else {
        const FileSystem = await import("expo-file-system/legacy");
        base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      }
      const r = await api("/distributor/me/sync/import", {
        method: "POST", body: { source: "file", filename: asset.name, file_base64: base64 }, timeoutMs: 120000,
      });
      reportImport(r); await load();
    } catch (e: any) {
      showError(e?.message || "Import failed", "Import failed");
    } finally { setBusy(null); }
  };

  const importDrive = async () => {
    if (!driveUrl.trim()) { showInfo("Paste a Google Drive link first"); return; }
    setBusy("drive");
    try {
      await api("/distributor/me/sync/settings", { method: "PATCH", body: { drive_url: driveUrl.trim() } });
      const r = await api("/distributor/me/sync/import", {
        method: "POST", body: { source: "drive", drive_url: driveUrl.trim() }, timeoutMs: 120000,
      });
      reportImport(r); await load();
    } catch (e: any) {
      showError(e?.message || "Could not fetch from Drive", "Import failed");
    } finally { setBusy(null); }
  };

  const saveDrive = async () => {
    try {
      await api("/distributor/me/sync/settings", { method: "PATCH", body: { drive_url: driveUrl.trim() } });
      showSuccess("Drive link saved");
    } catch (e: any) { showError(e?.message || "Could not save", "Failed"); }
  };

  const toggleAuto = async (v: boolean) => {
    setSettings((s: any) => ({ ...s, auto_sync: v }));
    try {
      await api("/distributor/me/sync/settings", { method: "PATCH", body: { auto_sync: v, drive_url: driveUrl.trim() || undefined } });
      showSuccess(v ? "Auto-sync ON — we'll re-fetch daily" : "Auto-sync OFF");
    } catch (e: any) { showError(e?.message || "Could not update", "Failed"); load(); }
  };

  const exportData = async (mode: "full" | "incremental", format: "csv" | "xlsx") => {
    setBusy(`${mode}-${format}`);
    try {
      const r = await api("/distributor/me/sync/export", { method: "POST", body: { mode, format }, timeoutMs: 120000 });
      if (Platform.OS === "web") {
        // Blob download — data: URIs get blocked/truncated for larger files, and the
        // anchor must be in the DOM for Firefox/Safari to honour the click.
        const bin = atob(r.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: r.mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = r.filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
        showSuccess(`${r.filename} · ${r.rows} rows from ${r.orders} orders`, "Downloaded");
      } else {
        const FileSystem = await import("expo-file-system/legacy").catch(() => null as any);
        const Sharing = await import("expo-sharing").catch(() => null as any);
        if (!FileSystem) { showError("File system unavailable on this device", "Export failed"); return; }
        const dest = `${FileSystem.cacheDirectory}${r.filename}`;
        await FileSystem.writeAsStringAsync(dest, r.base64, { encoding: FileSystem.EncodingType.Base64 });
        if (Sharing && (await Sharing.isAvailableAsync())) {
          await Sharing.shareAsync(dest, { mimeType: r.mime, dialogTitle: "Export orders", UTI: format === "csv" ? "public.comma-separated-values-text" : "com.microsoft.excel.xlsx" });
          showSuccess(`${r.rows} rows from ${r.orders} orders`, "Export ready");
        } else {
          showInfo(`Saved as ${r.filename} in app storage`, "Export ready");
        }
      }
      await load();
    } catch (e: any) {
      showError(e?.message || "Export failed", "Export failed");
    } finally { setBusy(null); }
  };

  const clearData = () => {
    confirm("Clear imported data?", "This removes all products, parties and ledger imported from your system. Your app orders are NOT affected.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear", style: "destructive", onPress: async () => {
          try { await api("/distributor/me/sync/clear", { method: "POST", body: { type: "all" } }); showSuccess("Cleared"); await load(); }
          catch (e: any) { showError(e?.message || "Failed", "Failed"); }
        },
      },
    ]);
  };

  if (loading) {
    return <SafeAreaView style={styles.container} edges={["top"]}><ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={styles.title}>Data Sync</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.banner}>
          <Ionicons name="sync-outline" size={18} color={colors.info} />
          <Text style={styles.bannerText}>No API for your billing software? Upload its daily backup export (Excel/CSV) here — we auto-read it and remove duplicates. Then export your app orders to import back into your system.</Text>
        </View>

        {/* Imported data snapshot */}
        <View style={styles.statsRow}>
          {(["product", "party", "ledger"] as const).map((k) => (
            <TouchableOpacity
              key={k}
              style={styles.statCard}
              onPress={() => router.push(`/d/sync-data?type=${k}`)}
              testID={`stat-${k}`}
            >
              <Text style={styles.statNum}>{(counts[k]?.count ?? 0).toLocaleString("en-IN")}</Text>
              <Text style={styles.statLabel}>{k === "product" ? "Items" : k === "party" ? "Parties" : "Ledger"}</Text>
              <Text style={styles.statView}>View →</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* IMPORT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Import from your system</Text>
          <Text style={styles.sectionSub}>Export Item Master / Party Master / Ledger to Excel or CSV from your billing software, then upload it here.</Text>

          <TouchableOpacity style={[styles.primaryBtn, busy === "import" && { opacity: 0.6 }]} onPress={importFile} disabled={!!busy} testID="import-file">
            {busy === "import" ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="cloud-upload-outline" size={18} color="#FFF" /><Text style={styles.primaryBtnText}>Upload Excel / CSV file</Text></>}
          </TouchableOpacity>

          <Text style={styles.orText}>or fetch from a Google Drive link</Text>
          <TextInput style={styles.input} value={driveUrl} onChangeText={setDriveUrl} placeholder="https://drive.google.com/file/d/..." placeholderTextColor={colors.textTertiary} autoCapitalize="none" testID="drive-url" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={[styles.outlineBtn, { flex: 1 }]} onPress={saveDrive} disabled={!!busy}><Text style={styles.outlineBtnText}>Save link</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.darkBtn, { flex: 2 }, busy === "drive" && { opacity: 0.6 }]} onPress={importDrive} disabled={!!busy} testID="import-drive">
              {busy === "drive" ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="logo-google" size={15} color="#FFF" /><Text style={styles.darkBtnText}>Fetch & Import</Text></>}
            </TouchableOpacity>
          </View>

          <View style={styles.autoRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.autoTitle}>Auto-sync daily</Text>
              <Text style={styles.autoSub}>Re-fetch the saved Drive link automatically ({settings.interval_hours || 24}h). Duplicates are skipped.</Text>
            </View>
            <Switch value={!!settings.auto_sync} onValueChange={toggleAuto} trackColor={{ true: colors.primary }} testID="auto-sync-toggle" />
          </View>
          {settings.last_import_at && <Text style={styles.meta}>Last import: {timeAgo(settings.last_import_at)}{settings.last_import_file ? ` · ${settings.last_import_file}` : ""}</Text>}
        </View>

        {/* EXPORT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Export orders to your system</Text>
          <Text style={styles.sectionSub}>Download orders placed by pharmacies in the app, then import into your billing software.</Text>

          <View style={styles.exportGrid}>
            <TouchableOpacity style={[styles.exportCard, busy === "full-xlsx" && { opacity: 0.6 }]} onPress={() => exportData("full", "xlsx")} disabled={!!busy} testID="export-full-xlsx">
              <Ionicons name="grid-outline" size={20} color={colors.success} /><Text style={styles.exportTitle}>All · Excel</Text><Text style={styles.exportSub}>Full history</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.exportCard, busy === "full-csv" && { opacity: 0.6 }]} onPress={() => exportData("full", "csv")} disabled={!!busy} testID="export-full-csv">
              <Ionicons name="document-text-outline" size={20} color={colors.success} /><Text style={styles.exportTitle}>All · CSV</Text><Text style={styles.exportSub}>Full history</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.exportCard, busy === "incremental-xlsx" && { opacity: 0.6 }]} onPress={() => exportData("incremental", "xlsx")} disabled={!!busy} testID="export-inc-xlsx">
              <Ionicons name="time-outline" size={20} color={colors.info} /><Text style={styles.exportTitle}>New · Excel</Text><Text style={styles.exportSub}>Since last export</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.exportCard, busy === "incremental-csv" && { opacity: 0.6 }]} onPress={() => exportData("incremental", "csv")} disabled={!!busy} testID="export-inc-csv">
              <Ionicons name="time-outline" size={20} color={colors.info} /><Text style={styles.exportTitle}>New · CSV</Text><Text style={styles.exportSub}>Since last export</Text>
            </TouchableOpacity>
          </View>
          {settings.last_export_at && <Text style={styles.meta}>Last export: {timeAgo(settings.last_export_at)}</Text>}
        </View>

        {/* HISTORY */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Sync history</Text>
            {(counts.product?.count || counts.party?.count || counts.ledger?.count) ? (
              <TouchableOpacity onPress={clearData}><Text style={styles.clearText}>Clear imported</Text></TouchableOpacity>
            ) : null}
          </View>
          {logs.length === 0 ? (
            <Text style={styles.emptyText}>No sync activity yet.</Text>
          ) : logs.slice(0, 20).map((l) => {
            const isImp = l.direction === "import";
            const err = l.result?.error;
            return (
              <View key={l.id} style={styles.logRow}>
                <Ionicons name={isImp ? "arrow-down-circle" : "arrow-up-circle"} size={18} color={err ? colors.danger : isImp ? colors.info : colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.logTitle}>{isImp ? "Import" : "Export"} · {l.source}{l.by === "auto-sync" ? " (auto)" : ""}</Text>
                  <Text style={styles.logSub}>
                    {err ? `Failed: ${err}` : isImp
                      ? `${l.result?.total_rows ?? 0} rows`
                      : `${l.result?.rows ?? 0} rows · ${l.result?.format || ""}`}
                  </Text>
                </View>
                <Text style={styles.logTime}>{new Date(l.at).toLocaleDateString()}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: "800", color: colors.text },

  banner: { flexDirection: "row", gap: 10, marginHorizontal: 12, padding: 12, backgroundColor: colors.infoBg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.info + "30" },
  bannerText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 17 },

  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, marginTop: 14 },
  statCard: { flex: 1, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", paddingVertical: 14 },
  statNum: { fontSize: 22, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: "600" },
  statView: { fontSize: 9.5, color: colors.primary, marginTop: 4, fontWeight: "800" },

  section: { marginTop: 18, paddingHorizontal: 12 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontWeight: "800", color: colors.text, fontSize: 14 },
  sectionSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 16, marginBottom: 10 },

  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, padding: 14, borderRadius: 12 },
  primaryBtnText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  orText: { textAlign: "center", color: colors.textTertiary, fontSize: 12, marginVertical: 10 },
  input: { backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text, marginBottom: 8 },
  outlineBtn: { alignItems: "center", justifyContent: "center", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  outlineBtnText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  darkBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#1F2937", padding: 12, borderRadius: 10 },
  darkBtnText: { color: "#FFF", fontWeight: "800", fontSize: 13 },

  autoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, padding: 12, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  autoTitle: { fontWeight: "800", color: colors.text, fontSize: 13 },
  autoSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2, lineHeight: 15 },
  meta: { color: colors.textTertiary, fontSize: 11, marginTop: 8 },

  exportGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  exportCard: { width: "48%", backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 },
  exportTitle: { fontWeight: "800", color: colors.text, fontSize: 13, marginTop: 4 },
  exportSub: { color: colors.textSecondary, fontSize: 11 },

  clearText: { color: colors.danger, fontWeight: "700", fontSize: 12 },
  emptyText: { color: colors.textTertiary, fontSize: 12, marginTop: 8 },
  logRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, marginTop: 8, backgroundColor: "#FFF", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  logTitle: { fontWeight: "700", color: colors.text, fontSize: 12.5, textTransform: "capitalize" },
  logSub: { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
  logTime: { color: colors.textTertiary, fontSize: 10 },
});
