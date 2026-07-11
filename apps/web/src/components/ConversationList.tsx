import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useChatStore } from "@/store/chat";
import { usePresenceStore } from "@/store/presence";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
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
            No conversations yet. Search for users or create a group.
          </p>
        )}
        {conversations.map((conv: Conversation) => {
          const isGroup = conv.type === "group";
          const name = isGroup ? (conv.group?.name ?? "Group") : (conv.participant?.name ?? "");
          const initial = name[0]?.toUpperCase() ?? "?";
          const isOnline = !isGroup && conv.participant ? online.has(conv.participant.id) : false;

          return (
            <button
              key={conv.id}
              onClick={() => setActiveConversation(conv.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-left",
                activeConversationId === conv.id && "bg-accent"
              )}
            >
              <div className="relative shrink-0">
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-semibold", isGroup ? "bg-emerald-500/20 text-emerald-600" : "bg-primary/20 text-primary")}>
                  {isGroup ? <Users className="h-5 w-5" /> : initial}
                </div>
                {isOnline && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <span className="font-medium text-sm truncate">{name}</span>
                  {conv.lastMessage && (
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {new Date(conv.lastMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {isGroup && conv.group
                    ? conv.lastMessage?.content ?? `${conv.group.memberCount} members`
                    : conv.lastMessage?.content ?? "No messages yet"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
