// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import './index.css';
import LoginPage from "./pages/LoginPage";
import NewOrganizationPage from "./pages/NewOrganizationPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import OwnerHomePage from "./pages/owner/OwnerHomePage";
import ProjectsPage from "./pages/projects/ProjectsPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";

const router = createBrowserRouter([
  {
    path: "/*",
    element: <App />,
    children: [
      { index: true, element: <LoginPage /> },
      { path: "new-organization", element: <NewOrganizationPage /> },
      { path: "admin/users", element: <AdminUsersPage /> },
      { path: "admin/users/new", element: <AdminUsersPage /> },
      { path: "owner", element: <OwnerHomePage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "change-password", element: <ChangePasswordPage /> }
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);