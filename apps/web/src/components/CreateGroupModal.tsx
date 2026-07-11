import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/store/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Search, Check } from "lucide-react";
import type { PublicUser, Conversation } from "@chat/shared";

interface Props {
  onClose: () => void;
}

export default function CreateGroupModal({ onClose }: Props) {
  const [groupName, setGroupName] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PublicUser[]>([]);
  const [selected, setSelected] = useState<PublicUser[]>([]);
  const [creating, setCreating] = useState(false);
  const { addConversation, setActiveConversation } = useChatStore();
  const queryClient = useQueryClient();

  async function handleSearch(q: string) {
    setUserQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
    setSearchResults(await res.json());
  }

  function toggleUser(user: PublicUser) {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user]
    );
  }

  async function handleCreate() {
    if (!groupName.trim() || selected.length === 0) return;
    setCreating(true);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: groupName.trim(), memberIds: selected.map((u) => u.id) }),
    });
    if (!res.ok) { setCreating(false); return; }
    const data = await res.json();

    const conv: Conversation = {
      id: data.conversationId,
      type: "group",
      group: data.group,
      lastMessage: null,
      unreadCount: 0,
      createdAt: new Date().toISOString(),
    };
    addConversation(conv);
    setActiveConversation(data.conversationId);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-base">New Group</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Group name</label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name..."
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Add members</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={userQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search users..."
              />
            </div>

            {searchResults.length > 0 && (
              <div className="mt-1 border rounded-md overflow-hidden">
                {searchResults.map((user) => {
                  const isSelected = selected.some((u) => u.id === user.id);
                  return (
                    <button
                      key={user.id}
                      onClick={() => toggleUser(user)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                        {user.name[0].toUpperCase()}
                      </div>
                      <span className="flex-1 text-sm">{user.name}</span>
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selected.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Selected ({selected.length})</p>
              <div className="flex flex-wrap gap-2">
                {selected.map((user) => (
                  <div key={user.id} className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm">
                    <span>{user.name}</span>
                    <button onClick={() => toggleUser(user)} className="hover:opacity-70">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!groupName.trim() || selected.length === 0 || creating}>
            {creating ? "Creating..." : "Create Group"}
          </Button>
        </div>
      </div>
    </div>
  );
}
