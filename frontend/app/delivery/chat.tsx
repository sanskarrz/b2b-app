// Delivery — chat with office
import { ChatView } from "@/src/components/ChatView";
import { api } from "@/src/api";

export default function DeliveryChat() {
  return (
    <ChatView
      title="Office"
      loadMessages={() => api("/staff/chat")}
      sendMessage={(text) => api("/staff/chat", { method: "POST", body: { text } }).then(() => {})}
      mineWhen={(m) => m.sender === "staff"}
      emptyHint="Message your office about deliveries, addresses or cash."
    />
  );
}
