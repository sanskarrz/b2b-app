// Office side of staff chat (owner/manager ↔ one staff member)
import { useLocalSearchParams } from "expo-router";
import { ChatView } from "@/src/components/ChatView";
import { api } from "@/src/api";

export default function OfficeStaffChat() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return (
    <ChatView
      title={name || "Team member"}
      loadMessages={() => api(`/distributor/me/staff-chat/${id}`)}
      sendMessage={(text) => api("/distributor/me/staff-chat", { method: "POST", body: { staff_id: id, text } }).then(() => {})}
      mineWhen={(m) => m.sender === "office"}
      emptyHint="Start the conversation with your team member."
    />
  );
}
