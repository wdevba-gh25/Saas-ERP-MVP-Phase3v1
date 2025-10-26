import { useEffect, useState } from "react";
import { getProjects, type Project } from "../api/projects.api";

export default function ProjectsGrid() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getProjects();
        setProjects(data);
      } catch (e: any) {
        setErr(e?.response?.data?.message ?? "Failed to load projects");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="p-4 text-gray-600">Loading projects…</p>;
  if (err) return <p className="p-4 text-red-600">{err}</p>;

  if (projects.length === 0)
    return <p className="p-4 text-gray-600">No projects yet.</p>;

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <div key={p.id} className="card">
          <div className="flex items-start justify-between">
            <h3 className="text-lg font-semibold">{p.name}</h3>
          </div>
          {p.description && (
            <p className="text-sm text-gray-600 mt-2">{p.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}