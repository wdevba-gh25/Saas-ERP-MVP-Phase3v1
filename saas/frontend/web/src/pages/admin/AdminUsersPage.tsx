import { useEffect, useMemo, useState } from "react";
import { useNavigate, useMatch } from "react-router-dom";
import CreateUserDrawer from "../../components/CreateUserDrawer";
import { useAuthStore } from "../../store/auth.store";
import { apiRequest } from "../../api/auth.api";
import PageLayout from "../../components/layout/PageLayout";

type GridUser = {
  userId: string;
  email: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  status: "Active" | "Inactive" | string;
  roles: string[];
};

type Filter = "all" | "me";

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const isNew = useMatch("/admin/users/new");
  const { token } = useAuthStore();

  const [users, setUsers] = useState<GridUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const path = useMemo(
    () => `/admin/users${filter === "me" ? "?createdBy=me" : ""}`,
    [filter]
  );

  const loadUsers = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiRequest<GridUser[]>(path, { token });
      setUsers(data);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]); // re-run when filter changes

  return (
    <PageLayout
      title="Users"
      actions={
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            onClick={() => setFilter(filter === "all" ? "me" : "all")}
            aria-label="Toggle created-by filter"
          >
            {filter === "all" ? "Show only my users" : "Show all users"}
          </button>
          <button className="btn-primary" onClick={() => navigate("new")}>
            + Create New User
          </button>
        </div>
      }
    >
      {loading && <div>Loading...</div>}
      {err && <div className="text-red-400">{err}</div>}

      {!loading && !err && (
        <div className="overflow-x-auto border border-slate-700 rounded-xl">
          <table className="min-w-full text-left">
            <thead className="bg-slate-800">
              <tr>
                <Th>Email</Th>
                <Th>Display Name</Th>
                <Th>First</Th>
                <Th>Last</Th>
                <Th>Status</Th>
                <Th>Roles</Th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-400" colSpan={6}>
                    {filter === "me"
                      ? "You haven't created any users yet."
                      : "No users found."}
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.userId} className="border-b border-slate-700">
                    <Td>{u.email}</Td>
                    <Td>{u.displayName}</Td>
                    <Td>{u.firstName ?? ""}</Td>
                    <Td>{u.lastName ?? ""}</Td>
                    <Td>{u.status}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {u.roles?.map((r) => (
                          <span
                            key={r}
                            className="inline-block text-xs px-2 py-0.5 rounded-full border border-slate-600"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <CreateUserDrawer
        open={!!isNew}
        onClose={() => navigate("/admin/users")}
        onCreated={() => {
          loadUsers();
          navigate("/admin/users");
        }}
      />
    </PageLayout>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 border-b border-slate-700">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-2">{children}</td>;
}