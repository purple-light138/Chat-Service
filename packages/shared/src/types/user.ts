export type UserStatus = "available" | "busy";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: UserStatus;
  lastSeen: string | null;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  status: UserStatus;
  lastSeen: string | null;
}
