import type { Document, DocumentVersion, Job, MergePreview, OutlineNode, Project, ProjectCreate, UploadIntent, VersionComparison } from "../../types/contracts";

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

export const createUploadIntent = (projectId: string, file: File, checksum_sha256: string, role: "master_candidate" | "source") => request<UploadIntent>(`/projects/${projectId}/documents/uploads`, { method: "POST", body: JSON.stringify({ filename: file.name, size_bytes: file.size, checksum_sha256, role }) });

export async function uploadDocx(file: File, intent: UploadIntent): Promise<Document> {
  const upload = await fetch(intent.upload_url, { method: "PUT", headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, body: file });
  if (!upload.ok) throw new Error(`Upload failed with ${upload.status}`);
  return request<Document>(`/documents/${intent.document_id}/uploads/complete`, { method: "POST", body: "{}" });
}

export const selectMaster = (projectId: string, documentId: string) => request<Document[]>(`/projects/${projectId}/master-document`, { method: "PUT", body: JSON.stringify({ document_id: documentId }) });
export const getOutline = (documentId: string) => request<OutlineNode[]>(`/documents/${documentId}/outline`, { cache: "no-store" });
export const createMergeJob = (projectId: string, operations: Array<{ source_version_id: string; source_node_key: string; destination_node_key: string | null; position: "before" | "after"; sort_order: number }>) => request<Job>(`/projects/${projectId}/merge-jobs`, { method: "POST", body: JSON.stringify({ operations }) });
export const previewMerge = (projectId: string, operations: Array<{ source_version_id: string; source_node_key: string; destination_node_key: string | null; position: "before" | "after"; sort_order: number }>) => request<MergePreview>(`/projects/${projectId}/merge-preview`, { method: "POST", body: JSON.stringify({ operations }) });
export const startAnalysis = (documentId: string) => request<Job>(`/documents/${documentId}/analysis`, { method: "POST", body: "{}" });
export const listVersions = (documentId: string) => request<DocumentVersion[]>(`/documents/${documentId}/versions`, { cache: "no-store" });
export const restoreVersion = (versionId: string, body: { expected_latest_version_id?: string; description?: string; created_by?: string }) => request<DocumentVersion>(`/versions/${versionId}/restore`, { method: "POST", body: JSON.stringify(body) });
export const compareVersions = (documentId: string, baseVersionId: string, targetVersionId: string) => request<VersionComparison>(`/documents/${documentId}/versions/compare?base_version_id=${baseVersionId}&target_version_id=${targetVersionId}`, { cache: "no-store" });
