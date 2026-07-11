import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession, signOut } from "@/lib/auth-client";
import { socket } from "@/lib/socket";
import ConversationList from "@/components/ConversationList";
import ChatWindow from "@/components/ChatWindow";
import CreateGroupModal from "@/components/CreateGroupModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogOut, Search, X, Users } from "lucide-react";
import type { PublicUser } from "@chat/shared";
import { useChatStore } from "@/store/chat";
import { usePresenceStore } from "@/store/presence";

export default function ChatPage() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const { setActiveConversation, conversations } = useChatStore();
  const { setOnline, setOffline, initPresence } = usePresenceStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PublicUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  useEffect(() => {
    if (!isPending && !session) navigate("/login");
  }, [session, isPending, navigate]);

  useEffect(() => {
    if (!session) return;
    socket.auth = { token: (session as any).session?.token };
    socket.connect();

    (socket as any).on("user:online", (userId: string) => setOnline(userId));
    (socket as any).on("user:offline", (userId: string) => setOffline(userId));

    return () => {
      (socket as any).off("user:online");
      (socket as any).off("user:offline");
      socket.disconnect();
    };
  }, [session, setOnline, setOffline]);

  // Bootstrap presence only for direct conversation participants
  useEffect(() => {
    if (conversations.length === 0) return;
    const ids = conversations
      .filter((c) => c.type === "direct" && c.participant)
      .map((c) => c.participant!.id)
      .join(",");
    if (!ids) return;
    fetch(`/api/users/presence?userIds=${ids}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: Record<string, boolean>) => initPresence(data))
      .catch(() => {});
  }, [conversations.length, initPresence]);

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
    const data = await res.json();
    setSearchResults(data);
    setSearching(false);
  }

  async function openConversation(userId: string) {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ participantId: userId }),
    });
    const conv = await res.json();
    setActiveConversation(conv.id);
    setSearchQuery("");
    setSearchResults([]);
  }

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 border-b bg-primary text-primary-foreground">
        <span className="font-bold text-lg">Chat</span>
        <div className="flex items-center gap-2">
          <span className="text-sm">{session?.user.name}</span>
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground hover:bg-primary/80"
            onClick={() => signOut().then(() => navigate("/login"))}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 border-r flex flex-col">
          <div className="p-2 border-b relative">
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 pr-8"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                title="New group"
                onClick={() => setShowCreateGroup(true)}
              >
                <Users className="h-4 w-4" />
              </Button>
            </div>

            {searchResults.length > 0 && (
              <div className="absolute left-2 right-2 top-full mt-1 bg-background border rounded-md shadow-lg z-10 overflow-hidden">
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => openConversation(user.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
                      {user.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{user.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <ConversationList />
        </aside>

        <main className="flex-1 flex overflow-hidden">
          <ChatWindow />
        </main>
      </div>

      {showCreateGroup && <CreateGroupModal onClose={() => setShowCreateGroup(false)} />}
    </div>
  );
}
