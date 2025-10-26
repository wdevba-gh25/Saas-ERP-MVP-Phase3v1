import { useEffect, useState } from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import { useAuthStore } from "./store/auth.store";
import LoginPage from "./pages/LoginPage";
import NewOrganizationPage from "./pages/NewOrganizationPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import ProjectsPage from "./pages/projects/ProjectsPage";
import ReportsPage from "./pages/reports/ReportsPage";
import AiToolsPage from "./pages/ai/AiToolsPage";
import ChatbotPage from "./pages/ai/ChatbotPage";
import PageLayout from "./components/layout/PageLayout";
import BillingPage from "./pages/billing/BillingPage";
import ProtectedRoute from "./components/ProtectedRoute";
import AuditorPage from "./pages/AuditorPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";

function Unauthorized() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="card p-6 text-center">
        <h2 className="text-xl mb-2">Unauthorized</h2>
        <p>You don’t have access to this area.</p>
        <a href="/reports" className="btn-primary mt-4 inline-block">Go to Reports</a>
      </div>
    </div>
  );
}

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    const doHydrate = async () => {
      await hydrate();
      setHydrating(false);
    };
    doHydrate();
  }, [hydrate]);

  if (hydrating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-300 text-lg">Loading session...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="/new-organization" element={<NewOrganizationPage />} />

      <Route
        path="/admin/users"
        element={
          <ProtectedRoute allowedRoles={["Owner", "Admin"]}>
            <AdminUsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users/new"
        element={
          <ProtectedRoute allowedRoles={["Owner", "Admin"]}>
            <AdminUsersPage />
          </ProtectedRoute>
        }
      />
      <Route
       path="/projects"
       element={
          <ProtectedRoute allowedRoles={["Owner", "Admin"]}>
           <ProjectsPage />
         </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute allowedRoles={["Owner", "Admin", "Analyst", "Auditor", "Member"]}>
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      {/* Wrap AI pages (both Tools + Chatbot) inside same layout so top nav and logout persist */}
      <Route
        element={
          <ProtectedRoute allowedRoles={["Owner", "Analyst", "Member"]}>
            <PageLayout>
              <Outlet />
            </PageLayout>       
          </ProtectedRoute>
        }
      >
        <Route path="/ai" element={<AiToolsPage />} />
        <Route path="/chatbot" element={<ChatbotPage />} />
      </Route>
      <Route path="/auditor" element={<AuditorPage />} />
      <Route
        path="/billing"
        element={
          <ProtectedRoute allowedRoles={["Owner"]}>
            <BillingPage />
          </ProtectedRoute>
        }
      />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="*" element={<LoginPage />} />
    </Routes>
  );
}