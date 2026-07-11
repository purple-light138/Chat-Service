import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useChatStore } from "@/store/chat";
import { usePresenceStore } from "@/store/presence";
import { cn } from "@/lib/utils";
import type { Conversation } from "@chat/shared";

async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch("/api/conversations", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch conversations");
  return res.json();
}

export default function ConversationList() {
  const { activeConversationId, setActiveConversation, setConversations } = useChatStore();
  const { online } = usePresenceStore();

  const { data } = useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
  });
  const conversations: Conversation[] = data ?? [];

  useEffect(() => {
    if (data) setConversations(data);
  }, [data, setConversations]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-lg">Chats</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <p className="text-muted-foreground text-sm text-center mt-8 px-4">
            No conversations yet. Search for users to start chatting.
          </p>
        )}
        {conversations.map((conv: Conversation) => (
          <button
            key={conv.id}
            onClick={() => setActiveConversation(conv.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-left",
              activeConversationId === conv.id && "bg-accent"
            )}
          >
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold">
                {conv.participant.name[0].toUpperCase()}
              </div>
              {online.has(conv.participant.id) && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline">
                <span className="font-medium text-sm truncate">{conv.participant.name}</span>
                {conv.lastMessage && (
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {new Date(conv.lastMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {conv.lastMessage?.content ?? "No messages yet"}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
