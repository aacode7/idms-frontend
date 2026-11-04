import type { Document, Project, ProjectCreate } from "../../types/contracts";

const apiUrl = process.env.NEXT_PUBLIC_IDMS_API_URL ?? "http://localhost:8000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) throw new Error(`IDMS API returned ${response.status}`);
  return response.json() as Promise<T>;
}

export const listProjects = () => request<Project[]>("/projects", { cache: "no-store" });
export const createProject = (project: ProjectCreate) => request<Project>("/projects", { method: "POST", body: JSON.stringify(project) });
export const getProject = (projectId: string) => request<Project>(`/projects/${projectId}`, { cache: "no-store" });
export const listDocuments = (projectId: string) => request<Document[]>(`/projects/${projectId}/documents`, { cache: "no-store" });
