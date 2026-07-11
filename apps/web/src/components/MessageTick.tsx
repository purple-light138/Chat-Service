import { Check, CheckCheck, Clock } from "lucide-react";
import type { MessageStatus } from "@chat/shared";
import { cn } from "@/lib/utils";

interface Props {
  status: MessageStatus;
}

export default function MessageTick({ status }: Props) {
  if (status === "sending" || status === "failed") {
    return <Clock className="h-3 w-3 opacity-60" />;
  }
  if (status === "sent") {
    return <Check className="h-3 w-3 opacity-60" />;
  }
  return (
    <CheckCheck
      className={cn("h-3 w-3", status === "read" ? "text-blue-400" : "opacity-60")}
    />
  );
}
