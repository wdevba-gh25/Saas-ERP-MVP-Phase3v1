import { useState } from "react";
import { useAuthStore } from "../store/auth.store"; // adjust path: from components/ -> "../../store/auth.store"

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export default function CreateUserDrawer({ open, onClose, onCreated }: Props) {
  const { token } = useAuthStore();   // ← get the in-memory token
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [ssn, setSsn] = useState("");
  const [role, setRole] = useState("Member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setFirstName(""); setLastName(""); setDisplayName(""); setEmail("");
    setSsn(""); setRole("Member");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/auth/users`, {  
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName, lastName, displayName, email, ssn,
          roles: [role],
          password: "TempPass123!" // backend will force MustChangePassword
        }),
      });

      // ↓↓↓ only handle errors if NOT ok
      if (!res.ok) {
        let msg = `Failed to create user (HTTP ${res.status})`;
        let bodyText = "";
        let body: any = null;
        try {
          bodyText = await res.text();
          if (bodyText) body = JSON.parse(bodyText);
        } catch { /* ignore parse errors */ }

        if (res.status === 409) {
          // Duplicate in same org
          msg = "Attempted to create a new user with an existing email. Try again with a different one.";
        } else if (res.status === 400) {
          // Prefer backend message; otherwise build it using domain
          const domain =
            body?.domain ??
            (typeof body?.message === "string"
              ? (body.message.match(/@[\w.-]\b/)?.[0])   // ← note the  here
              : undefined);
          msg =
            (typeof body?.message === "string" && body.message) ||
            (domain ? `Email must end with ${domain}.` : "Email must match your organization domain.");
        } else if (typeof body?.message === "string") {
          msg = body.message;
        } else if (bodyText) {
          msg = bodyText;
        }

        setError(msg);
        return; // keep drawer open on error
      }
      // Success path
      const tempPassword = "TempPass123!";
      alert(`User created successfully.\nTemporary password: ${tempPassword}\nIt will expire in 10 minutes. Please send it to the user immediately.`);
       

      if (onCreated) onCreated();
      resetForm();
      onClose();

    } catch (err: any) {
      setError(err.message || "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 transition ${open ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      {/* background dim */}
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      {/* drawer panel */}
      <div
        className={`absolute right-0 top-0 h-full w-full sm:w-[420px] bg-white shadow-xl transform transition-transform duration-300
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="p-6 flex flex-col h-full">
          <h2 className="text-lg font-semibold mb-4">Create New User</h2>

          <form onSubmit={handleSubmit} className="space-y-4 flex-1 overflow-y-auto">
            {error && <div className="text-red-500">{error}</div>}

            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} required />
              <input className="input" placeholder="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} required />
            </div>

            <input className="input" placeholder="Display Name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            <input className="input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input className="input" placeholder="SSN (optional)" value={ssn} onChange={e => setSsn(e.target.value)} />

            <select className="input" value={role} onChange={e => setRole(e.target.value)}>
              <option>Member</option>
              <option>Analyst</option>
              <option>Auditor</option>
              <option>Admin</option>
            </select>

            <div className="flex gap-2 justify-end pt-4">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}