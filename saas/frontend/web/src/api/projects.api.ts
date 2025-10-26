import { projectsClient } from "./client";

export interface Project {
id: string;
name: string;
description?: string;
createdAt?: string;
}

// Shape returned by the backend
type ServerProject = {
  projectId: string;
  name: string;
  description?: string;
  createdAt?: string;
};


// ---- Current project DTO from backend (/api/projects/current)
type CurrentProjectDto = {
  projectId: string;
  projectName: string;
  isPrimary?: boolean;
};

export async function getCurrentProject(): Promise<{ id: string; name: string; isPrimary?: boolean } | null> {
  try {
    const res = await projectsClient.get<CurrentProjectDto>("/projects/current");
    const p = res.data;
    return p ? { id: p.projectId, name: p.projectName, isPrimary: p.isPrimary } : null;
  } catch (err: any) {
    // 404 means "not assigned" → return null, others rethrow
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

export async function getProjects(): Promise<Project[]> {
    try {
    const { data } = await projectsClient.get<ServerProject[]>("/projects");
    
    return data.map(p => ({
      id: p.projectId,
      name: p.name,
      description: p.description,
      createdAt: p.createdAt,
    }));
  } 
  catch (err: any) 
  {
    // Single-use diagnostic. Remove after we see one failure payload.
    // eslint-disable-next-line no-console
    // console.error("[Projects] GET failed", {
    //   baseURL: (client.defaults as any)?.baseURL,
    //   url: "/projects",
    //   status: err?.response?.status,
    //   data: err?.response?.data,
    //   message: err?.message
    // });
    throw err;
  }
}