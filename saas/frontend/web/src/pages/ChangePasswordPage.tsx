import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth.store";

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { token?: string; email?: string } };
  const login = useAuthStore((s) => s.login);

  const tempToken = location?.state?.token || sessionStorage.getItem("tmpPwdToken") || null;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNew, setConfirmNew] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmNew) return setError("New passwords do not match");
    if (newPassword === currentPassword) return setError("New password must be different from current password");

    const token = tempToken || localStorage.getItem("authToken");
    if (!token) {
      setError("⚠️ Your temporary session has expired. Please log in again.");
      setTimeout(() => navigate("/", { replace: true }), 3000);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.status === 401) {
        setError("⚠️ Your temporary session has expired. Please log in again.");
        setTimeout(() => navigate("/", { replace: true }), 3000);
        return;
      }
      if (!res.ok) throw new Error((await res.text()) || "Failed to change password");

      let data: any = null;
      const text = await res.text();
      if (text) { try { data = JSON.parse(text); } catch {} }

      if (data?.token) {
        // cleanup stale flags FIRST
        sessionStorage.removeItem("tmpPwdToken");
        localStorage.removeItem("tempToken");
        localStorage.setItem("authToken", data.token);

        // fetch user + store in Zustand
        const meRes = await fetch(`${import.meta.env.VITE_API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${data.token}`, "Content-Type": "application/json" },
        });
        if (!meRes.ok) { setSuccess(true); return; }

        const user = await meRes.json();
        await login(data.token, user); // ✅ ensure Zustand updated

        const roles: string[] = (user.Roles || user.roles || []).map((r: string) => r.toLowerCase());
        const dest = (roles.includes("owner") || roles.includes("admin")) ? "/admin/users" : "/reports";

        // (Optional tiny delay to avoid UI race)
        await new Promise((r) => setTimeout(r, 50));

        navigate(dest);
        return;
      }

      // Legacy: no token returned
      setSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to change password";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-6">
          <h2 className="text-xl mb-2">Password changed</h2>
          <p>You can now log in with your new password.</p>
          <a href="/" className="btn-primary mt-4 block text-center">Back to Login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="card space-y-4 p-6">
        <h2 className="text-xl font-semibold">Change Password</h2>
        {error && <div className="text-red-500">{error}</div>}

        <input type="password" placeholder="Current Password" className="input" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
        <input type="password" placeholder="New Password" className="input" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
        <input type="password" placeholder="Confirm New Password" className="input" value={confirmNew} onChange={e => setConfirmNew(e.target.value)} required />

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Changing..." : "Change Password"}
        </button>
      </form>
    </div>
  );
}