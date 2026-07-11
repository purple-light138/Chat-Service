import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { socket } from "@/lib/socket";
import { useChatStore } from "@/store/chat";
import { usePresenceStore } from "@/store/presence";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import GroupInfoPanel from "@/components/GroupInfoPanel";
import MediaMessage from "@/components/MediaMessage";
import MessageTick from "@/components/MessageTick";
import { Send, Paperclip, X, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message, MessageType, MessageStatus, GroupMember } from "@chat/shared";

async function fetchMessages(conversationId: string): Promise<Message[]> {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch messages");
  return res.json();
}

interface UploadPreview {
  file: File;
  objectUrl: string;
  type: MessageType;
}

const ACCEPTED = "image/*,video/mp4,video/webm,application/pdf,audio/mpeg,audio/ogg,audio/wav,audio/webm";

function detectType(file: File): MessageType | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf") return "pdf";
  return null;
}

export default function ChatWindow() {
  const { activeConversationId, messages, setMessages, appendMessage, updateMessageStatus, conversations, removeConversation, updateGroupName, addGroupMember, removeGroupMember } = useChatStore();
  const { online, typing, setTyping } = usePresenceStore();
  const { data: session } = useSession();
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const conversation = conversations.find((c) => c.id === activeConversationId);
  const isGroup = conversation?.type === "group";
  const currentMessages = activeConversationId ? (messages[activeConversationId] ?? []) : [];
  const participantId = !isGroup ? conversation?.participant?.id : undefined;
  const isParticipantOnline = participantId ? online.has(participantId) : false;
  const typingUsers = activeConversationId ? (typing[activeConversationId] ?? new Set()) : new Set();
  const isTyping = typingUsers.size > 0;

  const { data: fetchedMessages } = useQuery({
    queryKey: ["messages", activeConversationId],
    queryFn: () => fetchMessages(activeConversationId!),
    enabled: !!activeConversationId,
  });

  useEffect(() => {
    if (fetchedMessages && activeConversationId) {
      setMessages(activeConversationId, fetchedMessages);
    }
  }, [fetchedMessages, activeConversationId, setMessages]);

  useEffect(() => {
    if (!activeConversationId) return;
    (socket as any).emit("conversation:join", activeConversationId);
    (socket as any).emit("message:read", activeConversationId);

    return () => {
      (socket as any).emit("conversation:leave", activeConversationId);
    };
  }, [activeConversationId]);

  // Message + typing socket events
  useEffect(() => {
    const onMessage = (msg: Message) => {
      if (msg.conversationId === activeConversationId) {
        appendMessage(msg);
        (socket as any).emit("message:read", msg.conversationId);
      } else {
        appendMessage(msg);
        (socket as any).emit("message:delivered", msg.id);
      }
    };

    const onStatus = ({ messageId, status }: { messageId: string; status: MessageStatus }) => {
      updateMessageStatus(messageId, status);
    };

    const onTypingStart = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      setTyping(conversationId, userId, true);
    };

    const onTypingStop = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      setTyping(conversationId, userId, false);
    };

    (socket as any).on("message:new", onMessage);
    (socket as any).on("message:status", onStatus);
    (socket as any).on("typing:start", onTypingStart);
    (socket as any).on("typing:stop", onTypingStop);

    return () => {
      (socket as any).off("message:new", onMessage);
      (socket as any).off("message:status", onStatus);
      (socket as any).off("typing:start", onTypingStart);
      (socket as any).off("typing:stop", onTypingStop);
    };
  }, [activeConversationId, appendMessage, updateMessageStatus, setTyping]);

  // Group socket events
  useEffect(() => {
    const onMemberAdded = ({ conversationId, member }: { conversationId: string; member: GroupMember }) => {
      addGroupMember(conversationId, member);
    };
    const onMemberRemoved = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      if (userId === session?.user.id) {
        removeConversation(conversationId);
      } else {
        removeGroupMember(conversationId, userId);
      }
    };
    const onGroupUpdated = ({ conversationId, name }: { conversationId: string; name: string }) => {
      updateGroupName(conversationId, name);
    };
    const onGroupDeleted = ({ conversationId }: { conversationId: string }) => {
      removeConversation(conversationId);
    };

    (socket as any).on("group:memberAdded", onMemberAdded);
    (socket as any).on("group:memberRemoved", onMemberRemoved);
    (socket as any).on("group:updated", onGroupUpdated);
    (socket as any).on("group:deleted", onGroupDeleted);

    return () => {
      (socket as any).off("group:memberAdded", onMemberAdded);
      (socket as any).off("group:memberRemoved", onMemberRemoved);
      (socket as any).off("group:updated", onGroupUpdated);
      (socket as any).off("group:deleted", onGroupDeleted);
    };
  }, [session, addGroupMember, removeGroupMember, removeConversation, updateGroupName]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.objectUrl);
    };
  }, [preview]);

  // Build a member name map for group messages
  const memberNameMap: Record<string, string> = {};
  if (isGroup && conversation?.group?.members) {
    for (const m of conversation.group.members) {
      memberNameMap[m.userId] = m.user.name;
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInput(e.target.value);
    if (!activeConversationId) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    (socket as any).emit("typing:start", activeConversationId);
    typingTimeoutRef.current = setTimeout(() => {
      (socket as any).emit("typing:stop", activeConversationId);
    }, 2000);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = detectType(file);
    if (!type) return;
    if (preview) URL.revokeObjectURL(preview.objectUrl);
    setPreview({ file, objectUrl: URL.createObjectURL(file), type });
    e.target.value = "";
  }

  function clearPreview() {
    if (preview) URL.revokeObjectURL(preview.objectUrl);
    setPreview(null);
  }

  const sendMessage = useCallback(
    (payload: any) => {
      const optimisticId = `optimistic-${Date.now()}`;
      const optimistic: Message = {
        id: optimisticId,
        conversationId: payload.conversationId,
        senderId: session?.user.id ?? "",
        type: payload.type,
        content: payload.content,
        status: "sending",
        fileUrl: payload.fileUrl ?? null,
        fileName: payload.fileName ?? null,
        fileSize: payload.fileSize ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      appendMessage(optimistic);

      (socket as any).emit("message:send", payload, (confirmed: Message) => {
        updateMessageStatus(optimisticId, confirmed.status);
        useChatStore.setState((s) => {
          const msgs = s.messages[payload.conversationId] ?? [];
          return {
            messages: {
              ...s.messages,
              [payload.conversationId]: msgs.map((m) =>
                m.id === optimisticId ? confirmed : m
              ),
            },
          };
        });
      });
    },
    [session, appendMessage, updateMessageStatus]
  );

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeConversationId) return;
    if (!input.trim() && !preview) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    (socket as any).emit("typing:stop", activeConversationId);

    if (preview) {
      setUploading(true);
      const form = new FormData();
      form.append("file", preview.file);

      const res = await fetch("/api/upload", { method: "POST", credentials: "include", body: form });
      if (!res.ok) { setUploading(false); return; }

      const { url, fileName, fileSize, type } = await res.json();
      clearPreview();
      setUploading(false);

      sendMessage({ conversationId: activeConversationId, type, content: fileName, fileUrl: url, fileName, fileSize });
      return;
    }

    sendMessage({ conversationId: activeConversationId, type: "text", content: input.trim() });
    setInput("");
  }

  if (!activeConversationId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>Select a conversation to start chatting</p>
      </div>
    );
  }

  const displayName = isGroup
    ? (conversation?.group?.name ?? "Group")
    : (conversation?.participant?.name ?? "");

  const headerSubtext = isTyping
    ? "typing..."
    : isGroup
    ? `${conversation?.group?.memberCount ?? 0} members`
    : isParticipantOnline
    ? "online"
    : conversation?.participant?.lastSeen
    ? `last seen ${new Date(conversation.participant.lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "offline";

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col h-full">
        <div className="px-4 py-3 border-b flex items-center gap-3">
          <div className="relative shrink-0">
            <div className={cn("w-9 h-9 rounded-full flex items-center justify-center font-semibold", isGroup ? "bg-emerald-500/20 text-emerald-600" : "bg-primary/20 text-primary")}>
              {isGroup ? <Users className="h-4 w-4" /> : displayName[0]?.toUpperCase()}
            </div>
            {!isGroup && isParticipantOnline && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground">{headerSubtext}</p>
          </div>
          {isGroup && (
            <button
              onClick={() => setShowGroupInfo((v) => !v)}
              className={cn("p-1.5 rounded-full transition-colors", showGroupInfo ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <Users className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {currentMessages.map((msg) => {
            const isOwn = msg.senderId === session?.user.id;
            const isMedia = ["image", "pdf", "video", "audio"].includes(msg.type);
            const senderName = isGroup && !isOwn ? (memberNameMap[msg.senderId] ?? "Unknown") : null;
            return (
              <div key={msg.id} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                <div className="max-w-[70%]">
                  {senderName && (
                    <p className="text-xs font-medium text-primary mb-0.5 px-1">{senderName}</p>
                  )}
                  <div
                    className={cn(
                      "px-3 py-2 rounded-2xl text-sm",
                      isOwn
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"
                    )}
                  >
                    {isMedia ? <MediaMessage message={msg} isOwn={isOwn} /> : <p>{msg.content}</p>}
                    <div className={cn("flex items-center gap-1 mt-0.5", isOwn ? "justify-end" : "justify-start")}>
                      <span className={cn("text-[10px]", isOwn ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {isOwn && <MessageTick status={msg.status} />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {preview && (
          <div className="px-4 py-2 border-t bg-muted/40 flex items-center gap-3">
            {preview.type === "image" ? (
              <img src={preview.objectUrl} alt="preview" className="h-16 w-16 object-cover rounded" />
            ) : (
              <div className="h-16 w-16 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground uppercase font-medium">
                {preview.type}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{preview.file.name}</p>
              <p className="text-xs text-muted-foreground">{(preview.file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button onClick={clearPreview} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="px-4 py-3 border-t flex gap-2">
          <input ref={fileInputRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleFileChange} />
          <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Paperclip className="h-4 w-4" />
          </Button>
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder={preview ? "Add a caption..." : "Type a message..."}
            className="flex-1"
            disabled={uploading}
          />
          <Button type="submit" size="icon" disabled={(!input.trim() && !preview) || uploading}>
            {uploading ? (
              <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>

      {isGroup && showGroupInfo && conversation?.group && (
        <GroupInfoPanel
          conversationId={activeConversationId}
          group={conversation.group}
          onClose={() => setShowGroupInfo(false)}
        />
      )}
    </div>
  );
}
