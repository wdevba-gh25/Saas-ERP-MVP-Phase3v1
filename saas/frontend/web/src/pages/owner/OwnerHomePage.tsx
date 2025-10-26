// src/pages/owner/OwnerHomePage.tsx
import { Link } from "react-router-dom";

export default function OwnerHomePage() {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <h2>Owner Dashboard</h2>
      <p>From here, Owners will manage Organization + Projects (CRUD). For now, placeholder.</p>
      <Link to="/projects" style={{ color: "#93c5fd" }}>Go to Projects</Link>
    </div>
  );
}