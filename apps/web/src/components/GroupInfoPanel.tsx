import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/store/chat";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Search, UserPlus, LogOut, Trash2, Crown, Edit2, Check } from "lucide-react";
import type { GroupInfo, PublicUser } from "@chat/shared";

interface Props {
  conversationId: string;
  group: GroupInfo;
  onClose: () => void;
}

export default function GroupInfoPanel({ conversationId, group, onClose }: Props) {
  const { data: session } = useSession();
  const { updateGroupName, addGroupMember, removeGroupMember, removeConversation, setActiveConversation } = useChatStore();
  const queryClient = useQueryClient();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(group.name);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<PublicUser[]>([]);
  const [busy, setBusy] = useState(false);

  const myId = session?.user.id;
  const isAdmin = group.myRole === "admin";

  async function saveName() {
    if (!nameInput.trim() || nameInput === group.name) { setEditingName(false); return; }
    await fetch(`/api/groups/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: nameInput.trim() }),
    });
    updateGroupName(conversationId, nameInput.trim());
    setEditingName(false);
  }

  async function searchUsers(q: string) {
    setAddQuery(q);
    if (q.trim().length < 2) { setAddResults([]); return; }
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
    const users: PublicUser[] = await res.json();
    const memberIds = new Set((group.members ?? []).map((m) => m.userId));
    setAddResults(users.filter((u) => !memberIds.has(u.id)));
  }

  async function addMember(user: PublicUser) {
    setBusy(true);
    const res = await fetch(`/api/groups/${conversationId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ userId: user.id }),
    });
    if (res.ok) {
      const member = await res.json();
      addGroupMember(conversationId, member);
      setAddQuery("");
      setAddResults([]);
    }
    setBusy(false);
  }

  async function removeMember(userId: string) {
    await fetch(`/api/groups/${conversationId}/members/${userId}`, { method: "DELETE", credentials: "include" });
    removeGroupMember(conversationId, userId);
  }

  async function leaveGroup() {
    await fetch(`/api/groups/${conversationId}/leave`, { method: "POST", credentials: "include" });
    removeConversation(conversationId);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    onClose();
  }

  async function deleteGroup() {
    if (!confirm("Delete this group for everyone?")) return;
    await fetch(`/api/groups/${conversationId}`, { method: "DELETE", credentials: "include" });
    removeConversation(conversationId);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    onClose();
  }

  return (
    <div className="w-72 border-l flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-sm">Group Info</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Group name */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-600 mx-auto mb-3">
            <span className="text-2xl font-bold">{group.name[0]?.toUpperCase()}</span>
          </div>
          {editingName && isAdmin ? (
            <div className="flex gap-2 items-center">
              <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} className="text-center" autoFocus onKeyDown={(e) => e.key === "Enter" && saveName()} />
              <button onClick={saveName} className="text-primary hover:opacity-70 shrink-0"><Check className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1.5">
              <span className="font-semibold">{group.name}</span>
              {isAdmin && (
                <button onClick={() => { setNameInput(group.name); setEditingName(true); }} className="text-muted-foreground hover:text-foreground">
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1">{group.memberCount} members</p>
        </div>

        {/* Members */}
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Members</p>
          <div className="space-y-1">
            {(group.members ?? []).map((m) => {
              const isMe = m.userId === myId;
              return (
                <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                    {m.user.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.user.name}{isMe && " (you)"}</p>
                  </div>
                  {m.role === "admin" && <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                  {isAdmin && !isMe && (
                    <button onClick={() => removeMember(m.userId)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Add member (admin only) */}
        {isAdmin && (
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Add Member</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-8 text-sm" placeholder="Search users..." value={addQuery} onChange={(e) => searchUsers(e.target.value)} />
            </div>
            {addResults.length > 0 && (
              <div className="mt-1 border rounded-md overflow-hidden">
                {addResults.map((user) => (
                  <button key={user.id} onClick={() => addMember(user)} disabled={busy} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent transition-colors text-left">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                      {user.name[0].toUpperCase()}
                    </div>
                    <span className="flex-1 text-sm truncate">{user.name}</span>
                    <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="p-4 border-t space-y-2">
        <Button variant="outline" className="w-full text-sm h-8 gap-2" onClick={leaveGroup}>
          <LogOut className="h-3.5 w-3.5" /> Leave Group
        </Button>
        {isAdmin && (
          <Button variant="destructive" className="w-full text-sm h-8 gap-2" onClick={deleteGroup}>
            <Trash2 className="h-3.5 w-3.5" /> Delete Group
          </Button>
        )}
      </div>
    </div>
  );
}
