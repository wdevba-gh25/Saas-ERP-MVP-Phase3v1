import { useEffect, useState, FormEvent } from "react";
import { useAuthStore } from "../store/auth.store";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  //clear any stale temp session flags on mount (harmless for first-time Owner/Admin)
  useEffect(() => {
    sessionStorage.removeItem("tmpPwdToken");
    localStorage.removeItem("tempToken");
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        // Safe parse
        let data: any = null;
        const text = await res.text();
        try { data = JSON.parse(text); } catch { throw new Error("Invalid server response"); }
        console.log("Login response JSON:", data);

        // Temp-token flow
        if (data?.mustChangePassword && data?.token) {
          // we intentionally store under authToken and drive the change-password screen
          localStorage.setItem("authToken", data.token);
          navigate("/change-password");
          return;
        }

        // Normal flow
        if (!data?.token) throw new Error("Login response missing token");
        const token = data.token;

        const meRes = await fetch(`${import.meta.env.VITE_API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        if (!meRes.ok) throw new Error((await meRes.text()) || "Failed to get user info");

        const user = await meRes.json();

        // Enrich with projectId from JWT
        const payload = JSON.parse(atob(token.split(".")[1]));
        const enrichedUser = { ...user, activeProjectId: payload.projectId ?? null };

        login(token, enrichedUser);
        localStorage.setItem("authToken", token);

        // role-based landing
        const roles: string[] = (user.Roles || user.roles || []).map((r: string) => r.toLowerCase());
        const dest = (roles.includes("owner") || roles.includes("admin")) ? "/admin/users" : "/reports";
        navigate(dest);
        return;
      }

      // Error handling (legacy tolerant)
      const text = await res.text();
      console.error("Login error response text:", text);
      try {
        const maybeJson = JSON.parse(text);
        if (maybeJson?.code === "MustChangePassword") {
          navigate("/change-password");
          return;
        }
      } catch {}
      if (text.includes("MustChangePassword")) {
        navigate("/change-password");
        return;
      }
      throw new Error(text || "Invalid credentials");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid credentials";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md card">
        <h1 className="text-center text-2xl font-semibold mb-6">SaaS ERP Demo</h1>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block mb-1 text-sm text-slate-300">Email</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
          </div>

          <div>
            <label className="block mb-1 text-sm text-slate-300">Password</label>
            <div className="relative">
              <input type={showPass ? "text" : "password"} className="input pr-16" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
              <button type="button" className="absolute inset-y-0 right-2 my-auto px-2 text-xs text-slate-400 hover:text-slate-200" onClick={() => setShowPass((s) => !s)}>
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && <div className="text-red-400 text-sm text-center">{error}</div>}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="text-center mt-6 text-sm text-slate-400">
          Don’t have an account? <a href="/new-organization" className="link">Create Organization</a>
        </div>
      </div>
    </div>
  );
}