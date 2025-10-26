import type { Role } from "../../store/auth.store";

export type NavLink = {
  label: string;
  path: string;
  rolesAllowed: Role[];
};

export const navLinks: NavLink[] = [
  { label: "Users", path: "/admin/users", rolesAllowed: ["Owner", "Admin"] },
  { label: "Projects", path: "/projects", rolesAllowed: ["Owner", "Admin"] },
  { label: "Reports", path: "/reports", rolesAllowed: ["Owner", "Analyst", "Auditor"] },
  { label: "AI Tools", path: "/ai", rolesAllowed: ["Owner", "Analyst", "Member"] },
  { label: "AI Chatbot", path: "/chatbot", rolesAllowed: ["Owner", "Analyst", "Member"] },
  { label: "Billing", path: "/billing", rolesAllowed: ["Owner"] },
];