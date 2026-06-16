// Generate a customer account-statement PDF and share it (WhatsApp, email, etc.)
// NOTE: expo-print / expo-sharing are imported lazily inside the function so that
// these native modules never affect app startup or other screens.
import { Platform } from "react-native";
import { api } from "@/src/api";

const inr = (n: number) =>
  "₹" + Math.round(n || 0).toLocaleString("en-IN");

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
};

function buildHtml(s: any): string {
  const d = s.distributor || {};
  const c = s.customer || {};
  const cr = s.credit || {};
  const sm = s.summary || {};
  const rows = (s.entries || [])
    .map((e: any) => {
      const neg = e.balance < 0;
      return `<tr>
        <td>${fmtDate(e.date)}</td>
        <td><div class="ref">${e.ref || ""}</div><div class="lbl">${e.label || ""}</div></td>
        <td class="num">${e.debit ? inr(e.debit) : "—"}</td>
        <td class="num credit">${e.credit ? inr(e.credit) : "—"}</td>
        <td class="num ${neg ? "ok" : "due"}">${inr(Math.abs(e.balance))}${neg ? " Cr" : " Dr"}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #2A1F14; margin: 0; padding: 28px; font-size: 12px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #F08C47; padding-bottom: 14px; }
    .brand { font-size: 22px; font-weight: 800; color: #F08C47; }
    .muted { color: #7A6A55; font-size: 11px; line-height: 1.5; }
    h1 { font-size: 15px; letter-spacing: 1px; color: #7A6A55; text-transform: uppercase; margin: 18px 0 4px; }
    .grid { display: flex; gap: 14px; margin-top: 10px; }
    .box { flex: 1; background: #FCF6E6; border: 1px solid #EDE4D3; border-radius: 10px; padding: 12px; }
    .box .k { font-size: 9px; font-weight: 800; letter-spacing: .5px; color: #7A6A55; text-transform: uppercase; }
    .box .v { font-size: 13px; font-weight: 700; margin-top: 3px; }
    .kpis { display: flex; gap: 10px; margin-top: 14px; }
    .kpi { flex: 1; border: 1px solid #EDE4D3; border-radius: 10px; padding: 12px; text-align: center; }
    .kpi .k { font-size: 9px; font-weight: 800; color: #7A6A55; text-transform: uppercase; }
    .kpi .v { font-size: 18px; font-weight: 800; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .4px; color: #7A6A55; border-bottom: 2px solid #EDE4D3; padding: 8px 6px; }
    td { padding: 8px 6px; border-bottom: 1px solid #F0E9DA; vertical-align: top; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .ref { font-weight: 700; font-size: 11px; }
    .lbl { color: #7A6A55; font-size: 10px; }
    .credit { color: #16A34A; }
    .due { color: #DC2626; font-weight: 700; }
    .ok { color: #16A34A; font-weight: 700; }
    .foot { margin-top: 22px; padding-top: 12px; border-top: 1px solid #EDE4D3; color: #B0A28C; font-size: 10px; }
    .closing { background: #FFE9D8; border:1px solid #F6AC85; border-radius: 10px; padding: 12px 14px; margin-top: 14px; display:flex; justify-content: space-between; align-items:center; }
    .closing .k { font-weight: 800; font-size: 12px; }
    .closing .v { font-weight: 800; font-size: 18px; }
  </style></head><body>
    <div class="top">
      <div>
        <div class="brand">${d.short_name || d.name || "Distributor"}</div>
        <div class="muted">${d.address || d.location || ""}${d.gst ? "<br/>GSTIN: " + d.gst : ""}${d.phone ? "<br/>Ph: " + d.phone : ""}</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:800;font-size:14px">ACCOUNT STATEMENT</div>
        <div class="muted">Generated ${fmtDate(s.generated_at)}</div>
      </div>
    </div>

    <h1>Billed To</h1>
    <div class="grid">
      <div class="box">
        <div class="k">Customer</div>
        <div class="v">${c.name || ""}</div>
        <div class="muted">${c.contact_name ? c.contact_name + " · " : ""}${c.phone || ""}<br/>${c.address || ""}${c.gst ? "<br/>GSTIN: " + c.gst : ""}${c.drug_license ? "<br/>DL: " + c.drug_license : ""}</div>
      </div>
      <div class="box">
        <div class="k">Credit Line</div>
        <div class="v">${inr(cr.credit_used)} used of ${inr(cr.credit_limit)}</div>
        <div class="muted">Available: ${inr(cr.credit_available)}<br/>Terms: ${cr.credit_days || 0} days</div>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="k">Total Billed</div><div class="v">${inr(sm.total_billed)}</div></div>
      <div class="kpi"><div class="k">Total Credited</div><div class="v" style="color:#16A34A">${inr(sm.total_credited)}</div></div>
      <div class="kpi"><div class="k">Outstanding</div><div class="v" style="color:#DC2626">${inr(sm.outstanding)}</div></div>
      <div class="kpi"><div class="k">Overdue</div><div class="v" style="color:#DC2626">${inr(sm.overdue)}</div></div>
    </div>

    <h1>Ledger (${sm.entry_count || 0} entries)</h1>
    <table>
      <thead><tr><th>Date</th><th>Particulars</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#B0A28C;padding:20px">No transactions</td></tr>'}</tbody>
    </table>

    <div class="closing">
      <div class="k">${sm.closing_balance > 0 ? "Net Amount Receivable" : "Net Balance (in customer's favour)"}</div>
      <div class="v" style="color:${sm.closing_balance > 0 ? "#DC2626" : "#16A34A"}">${inr(Math.abs(sm.closing_balance))}</div>
    </div>

    <div class="foot">This is a computer-generated statement and does not require a signature. For queries, contact ${d.short_name || "your distributor"}.</div>
  </body></html>`;
}

/**
 * Generate the statement PDF for a customer and open the OS share sheet
 * (WhatsApp / Email / Drive…). Returns { ok, reason }.
 */
export async function shareCustomerStatement(custId: string): Promise<{ ok: boolean; reason?: string }> {
  const Print = await import("expo-print");
  const Sharing = await import("expo-sharing");
  const data = await api(`/distributor/me/customers/${custId}/statement`);
  const html = buildHtml(data);
  const fileName = `Statement-${(data.customer?.name || "customer").replace(/[^a-z0-9]/gi, "-")}`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  // On native, rename to a friendly filename so WhatsApp shows it nicely
  let shareUri = uri;
  try {
    const FileSystem = await import("expo-file-system/legacy").catch(() => null as any);
    if (FileSystem && Platform.OS !== "web") {
      const dest = `${FileSystem.cacheDirectory}${fileName}.pdf`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      shareUri = dest;
    }
  } catch {
    // fall back to the original uri
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    // Web / no share sheet → open the native print dialog so the user can Save as PDF
    await Print.printAsync({ html });
    return { ok: true, reason: "printed" };
  }

  await Sharing.shareAsync(shareUri, {
    mimeType: "application/pdf",
    dialogTitle: `Share statement · ${data.customer?.name || ""}`,
    UTI: "com.adobe.pdf",
  });
  return { ok: true };
}
