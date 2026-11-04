// Multipart upload that works on web AND real phones.
// Native global fetch is expo/fetch (SDK 54) — it rejects the RN {uri,name,type} part
// shape, so we read the file into a Blob with expo/fetch and append that.
import { Platform } from "react-native";
import { fetch as expoFetch } from "expo/fetch";

export type UploadPart = { uri: string; name: string; mimeType?: string | null };

export async function uploadForm(
  url: string,
  opts: { headers?: Record<string, string>; files: Record<string, UploadPart>; fields?: Record<string, string> }
): Promise<any> {
  const form = new FormData();
  for (const [k, v] of Object.entries(opts.fields || {})) form.append(k, v);
  for (const [field, f] of Object.entries(opts.files)) {
    const blob = Platform.OS === "web" ? await (await fetch(f.uri)).blob() : await (await expoFetch(f.uri)).blob();
    form.append(field, blob as any, f.name);
  }
  const doFetch: any = Platform.OS === "web" ? fetch : expoFetch;
  const res = await doFetch(url, { method: "POST", headers: opts.headers || {}, body: form });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error((typeof data?.detail === "string" && data.detail) || `Upload failed (${res.status})`);
  return data;
}
