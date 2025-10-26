import { ReactNode, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth.store";

interface ProtectedRouteProps {
  allowedRoles: string[]; // e.g. ["Owner","Admin"] or ["*"] for any authenticated
  children: ReactNode;
}

export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // normalize roles from backend shape
  const roles: string[] = (user?.roles || user?.roles || []).map((r: string) => r.toLowerCase());
  const allow: string[] = allowedRoles.map(r => r.toLowerCase());
  const hasAccess = allow.includes("*") || roles.some(r => allow.includes(r));

  useEffect(() => {
    if (!user) {
      navigate("/", { replace: true });
      return;
    }
    if ((user.roles ?? user.roles ?? []).length === 0) {
      console.warn("[SECURITY] User has no roles");
      navigate("/unauthorized", { replace: true });
      return;
    }
    if (!hasAccess) {
      // send auditors to their page; others to a generic unauthorized
      if (roles.length === 1 && roles[0] === "auditor") {
        console.info("[SECURITY] Auditor redirected to /auditor");
        navigate("/auditor", { replace: true });
      } else {
        console.warn("[SECURITY] Unauthorized access attempt by", user.email || user.email);
        navigate("/unauthorized", { replace: true });
      }
    }
  }, [user, hasAccess, navigate, roles]);

  if (!user) return null;
  return hasAccess ? <>{children}</> : null;
}