import { createAuthClient } from "better-auth/react";

// Use the current origin so auth works in dev (via Vite proxy) and production (same-origin)
const BASE = typeof window !== "undefined" ? window.location.origin : "http://localhost:3001";

export const authClient = createAuthClient({
  baseURL: `${BASE}/api/auth`,
});

export const signIn = authClient.signIn;
export const signUp = authClient.signUp;
export const signOut = authClient.signOut;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useSession: () => any = authClient.useSession as any;
