// Shared flag / query form: category + title + details (type / voice) + photos.
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { VoiceRecorder } from "@/src/components/VoiceRecorder";
import { PhotoAttach, Photo } from "@/src/components/PhotoAttach";
import { colors, radius } from "@/src/theme";

export const ISSUE_CATEGORIES = [
  { key: "damaged_goods", label: "Damaged Goods" },
  { key: "wrong_supply", label: "Wrong Supply" },
  { key: "extra_supply", label: "Extra Supply" },
  { key: "no_supply", label: "No Supply" },
  { key: "rate_scheme", label: "Rate/Scheme Issue" },
];

export type IssueValue = {
  category: string;
  title: string;
  details: string;
  photos: Photo[];
  audio_file_id: string | null;
  transcript: string;
};

export const emptyIssue = (title = ""): IssueValue => ({
  category: "", title, details: "", photos: [], audio_file_id: null, transcript: "",
});

export function issuePayload(v: IssueValue) {
  return {
    type: v.category,
    title: v.title.trim(),
    description: v.details.trim() || null,
    photo_file_ids: v.photos.map((p) => p.id),
    audio_file_id: v.audio_file_id,
    transcript: v.transcript || null,
  };
}

export function IssueForm({ value, onChange, titleLabel = "Product name", hideTitle = false }: { value: IssueValue; onChange: (v: IssueValue) => void; titleLabel?: string; hideTitle?: boolean }) {
  const set = (p: Partial<IssueValue>) => onChange({ ...value, ...p });
  return (
    <View style={{ gap: 14 }}>
      <View>
        <Text style={styles.label}>Issue category</Text>
        <View style={styles.chips}>
          {ISSUE_CATEGORIES.map((c) => {
            const on = value.category === c.key;
            return (
              <TouchableOpacity key={c.key} style={[styles.chip, on && styles.chipOn]} onPress={() => set({ category: c.key })} testID={`cat-${c.key}`}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {!hideTitle && (
      <View>
        <Text style={styles.label}>{titleLabel}</Text>
        <TextInput
          style={styles.input} value={value.title} onChangeText={(t) => set({ title: t })}
          placeholder="e.g. Azee 500 Tab" placeholderTextColor={colors.textTertiary} testID="issue-title"
        />
      </View>
      )}
      <View>
        <Text style={styles.label}>Details</Text>
        <TextInput
          style={[styles.input, { height: 96, textAlignVertical: "top", paddingTop: 10 }]} multiline
          value={value.details} onChangeText={(t) => set({ details: t })}
          placeholder="Describe the issue — or tap Speak" placeholderTextColor={colors.textTertiary} testID="issue-details"
        />
        <View style={{ marginTop: 8 }}>
          <VoiceRecorder
            onResult={({ text, file_id }) =>
              onChange({ ...value, audio_file_id: file_id, transcript: text, details: [value.details.trim(), text].filter(Boolean).join(" ") })
            }
          />
          {!!value.audio_file_id && <Text style={styles.saved}>✓ Voice note attached</Text>}
        </View>
      </View>
      <View>
        <Text style={styles.label}>Photos (optional)</Text>
        <PhotoAttach photos={value.photos} onChange={(photos) => set({ photos })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "800", color: colors.textSecondary, marginBottom: 6, letterSpacing: 0.3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, height: 36, justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12.5, fontWeight: "700", color: colors.text },
  chipTextOn: { color: "#FFF" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 46, fontSize: 14, color: "#000", backgroundColor: "#FFF" },
  saved: { color: colors.success, fontSize: 12, fontWeight: "700", marginTop: 6 },
});
