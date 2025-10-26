import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuthStore, userInitial, firstName } from "../../store/auth.store";
import { navLinks } from "./navLinks";
import { getCurrentProject } from "../../api/projects.api";

interface PageLayoutProps {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}

export default function PageLayout({
  title,
  actions,
  children,
  maxWidth = "max-w-5xl"
}: PageLayoutProps) {
  const { user, logout } = useAuthStore();
  const nav = useNavigate();
  const loc = useLocation();

  const [currentProject, setCurrentProject] = useState<{ name: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    getCurrentProject()
      .then((p) => mounted && setCurrentProject(p ? { name: p.name } : null))
      .catch(() => mounted && setCurrentProject(null));
    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = () => {
    logout();
    nav("/");
  };

  const allowedLinks = user
    ? navLinks.filter(link => link.rolesAllowed.some(r => user.roles.includes(r)))
    : [];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* ─────── Top Navigation Bar ─────── */}
      <header className="flex justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div
          className="text-xl font-semibold text-blue-400 cursor-pointer select-none"
          onClick={() => nav("/")}
        >
          SaaS ERP Demo
        </div>

        <nav className="flex items-center gap-6">
          {allowedLinks.map(link => (
            <button
              key={link.path}
              onClick={() => nav(link.path)}
              className={`text-sm ${
                loc.pathname === link.path
                  ? "text-blue-400 font-semibold"
                  : "text-slate-300 hover:text-slate-100"
              }`}
            >
              {link.label}
            </button>
          ))}
        </nav>
        {user && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-300">
              Welcome <strong>{firstName(user)}</strong>
              {currentProject && (
                <span className="ml-2 opacity-80">· Project: {currentProject.name}</span>
              )}
            </span>
            <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-semibold">
              {userInitial(user)}
            </div>
            <button
              onClick={handleLogout}
              className="btn-secondary px-3 py-1 text-sm"
            >
              Logout
            </button>
          </div>
        )}

      </header>

      {/* ─────── Main Page Content ─────── */}
      <main className="flex-1 px-4 py-10">
        <div className={`card mx-auto ${maxWidth}`}>
          {(title || actions) && (
            <div className="flex justify-between items-center mb-6">
              {title && <h1 className="text-2xl font-semibold">{title}</h1>}
              {actions && <div className="flex gap-2">{actions}</div>}
            </div>
          )}
          <div>{children}</div>
        </div>
      </main>
    </div>
  );
}