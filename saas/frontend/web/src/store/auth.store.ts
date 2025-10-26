import { create } from "zustand";

export type Role = "Owner" | "Admin" | "Member" | "Analyst" | "Auditor";

export interface AuthUser {
  userId: string;
  organizationId: string;
  email: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  status?: string;
  roles: Role[];
  activeProjectId?: string | null;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => Promise<void> | void;
  logout: () => void;
  hydrate: () => Promise<void>;
  setActiveProject: (projectId: string) => void;
}

// Lightweight JWT decode without any dependency
function decodeJwt<T = any>(token: string): T | null {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set,get) => ({
  token: null,
  user: null,

  login: async (token: string, user: AuthUser) => {
    localStorage.setItem("authToken", token);
    const decoded = decodeJwt<any>(token);
    const enriched: AuthUser = {
      ...user,
      activeProjectId: decoded?.projectId ?? null,
      };
    set({ token, user });
  },

  logout: () => {
    localStorage.removeItem("authToken");
    set({ token: null, user: null });
  },

  hydrate: async () => {
    const token = localStorage.getItem("authToken");
    if (!token) return;

    const decoded = decodeJwt<any>(token);
    if (!decoded) {
      localStorage.removeItem("authToken");
      return;
    }

    const user: AuthUser = {
      userId: decoded.userId,
      organizationId: decoded.organizationId,
      email: decoded.email ?? decoded.sub ?? "",
      displayName: decoded.displayName ?? decoded.email ?? "",
      roles: (decoded["role"] ? (Array.isArray(decoded["role"]) ? decoded["role"] : [decoded["role"]]) : []) as Role[],
      activeProjectId: decoded.projectId ?? null,
    };

    set({ token, user });
  },

  setActiveProject: (projectId: string) => {
    const current = get().user;
    if (current) {
      set({ user: { ...current, activeProjectId: projectId } });
    }
  },
}));

export const userInitial = (u?: AuthUser | null) =>
  (u?.lastName?.[0] ?? (u?.displayName?.split(" ").slice(-1)[0]?.[0] ?? "")).toUpperCase();

export const firstName = (u?: AuthUser | null) =>
  u?.firstName || u?.displayName?.split(" ")[0] || u?.email || "User";

