import { FormEvent, useMemo, useState } from "react";
import { apiRequest } from "../../src/api/auth.api";
import { useNavigate } from "react-router-dom";
import PageLayout from "../../src/components/layout/PageLayout";

type NewOrgPayload = {
  organizationName: string;
  taxCode: string;
  complianceStatus: "Active" | "Pending" | "Suspended";
  owner: {
    firstName: string;
    lastName: string;
    ssn: string;
    displayName: string;
  };
  admin: {
    firstName: string;
    lastName: string;
    ssn: string;
    displayName: string;
  };
  termsAccepted: boolean;
};

export default function NewOrganizationPage() {
  const nav = useNavigate();
  const [orgName, setOrgName] = useState("");
  const [tax, setTax] = useState("");
  const [compliance, setCompliance] = useState<"Active" | "Pending" | "Suspended">("Active");

  const [oFirst, setOFirst] = useState("");
  const [oLast, setOLast] = useState("");
  const [oSSN, setOSSN] = useState("");
  const oDisplay = useMemo(() => `${oFirst} ${oLast}`.trim(), [oFirst, oLast]);

  const [aFirst, setAFirst] = useState("");
  const [aLast, setALast] = useState("");
  const [aSSN, setASSN] = useState("");
  const aDisplay = useMemo(() => `${aFirst} ${aLast}`.trim(), [aFirst, aLast]);

  const [tosChecked, setTosChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);

    const payload: NewOrgPayload = {
      organizationName: orgName,
      taxCode: tax,
      complianceStatus: compliance,
      owner: { firstName: oFirst, lastName: oLast, ssn: oSSN, displayName: oDisplay },
      admin: { firstName: aFirst, lastName: aLast, ssn: aSSN, displayName: aDisplay },
      termsAccepted: tosChecked,
    };

    try {
      const r = await apiRequest<{ message: string }>(
        "/onboarding/new-organization",
        { method: "POST", body: payload as unknown }
      );
      setMsg(r.message || `Welcome ${orgName} to SaaS ERP Demo platform!`);
    } catch (ex: any) {
      setErr(ex?.message || "Failed to create organization");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout maxWidth="max-w-4xl">
      {!msg && (
        <form
          title="Register New Organization"
          onSubmit={onSubmit}
          className={`space-y-6 ${busy ? "opacity-50 pointer-events-none" : ""}`}
        >
          <section className="card space-y-4">
            <h3 className="text-lg font-medium">Organization</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Organization Name">
                <input className="input" value={orgName} onChange={e => setOrgName(e.target.value)} required />
              </Field>
              <Field label="Tax / LLC IRS Code">
                <input className="input" value={tax} onChange={e => setTax(e.target.value)} />
              </Field>
              <Field label="Tax compliance status">
                <select className="input" value={compliance} onChange={e => setCompliance(e.target.value as any)}>
                  <option value="Active">Active</option>
                  <option value="Pending">Pending</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="card space-y-4">
            <h3 className="text-lg font-medium">Owner (Representative)</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="First Name"><input className="input" value={oFirst} onChange={e => setOFirst(e.target.value)} /></Field>
              <Field label="Last Name"><input className="input" value={oLast} onChange={e => setOLast(e.target.value)} /></Field>
              <Field label="SSN"><input className="input" value={oSSN} onChange={e => setOSSN(e.target.value)} /></Field>
            </div>
          </section>

          <section className="card space-y-4">
            <h3 className="text-lg font-medium">Admin (for this Organization)</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="First Name"><input className="input" value={aFirst} onChange={e => setAFirst(e.target.value)} /></Field>
              <Field label="Last Name"><input className="input" value={aLast} onChange={e => setALast(e.target.value)} /></Field>
              <Field label="SSN"><input className="input" value={aSSN} onChange={e => setASSN(e.target.value)} /></Field>
            </div>
          </section>

          <section className="card space-y-4 opacity-50">
            <h3 className="text-lg font-medium">Payment (Demo only)</h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Cardholder Name"><input className="input" disabled value="John Demo" readOnly /></Field>
              <Field label="Card Number"><input className="input" disabled value="4111 1111 1111 1111" readOnly /></Field>
              <Field label="Expiry / CVC"><input className="input" disabled value="12/29 — 123" readOnly /></Field>
            </div>
          </section>

          <section className="card space-y-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={tosChecked} onChange={e => setTosChecked(e.target.checked)} />
              <span>I agree with the Terms of Service</span>
            </label>
            <button
              type="submit"
              disabled={!tosChecked || busy}
              className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy && (
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  ></path>
                </svg>
              )}
              {busy ? "Creating..." : "I agree with the Terms of Service"}
            </button>
          </section>
        </form>
      )}

      {msg && (
        <div className="card mt-6 space-y-4 text-center">
          <div className="font-semibold text-green-400">Success</div>
          <p className="whitespace-pre-line">{msg}</p>
          <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
            ⚠️ WARNING: The Owner's temporary password will expire in 10 minutes.
            Please log in and change it immediately. After it expires, contact IT Support to reset it.
          </div>
          <button onClick={() => nav("/")} className="btn-secondary w-full">
            Back to Login
          </button>
        </div>
      )}

      {err && <div className="card mt-6 border border-red-800 bg-red-950 text-red-200">{err}</div>}
    </PageLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-slate-300">{label}</span>
      {children}
    </label>
  );
}