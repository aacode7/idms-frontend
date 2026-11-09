import type {
  Document,
  DocumentVersion,
  Job,
  MergePreview,
  MergeResult,
  OutlineNode,
  Project,
  ProjectCreate,
  UploadIntent,
  VersionComparison,
} from "../../types/contracts";

const apiUrl =
  process.env.NEXT_PUBLIC_IDMS_API_URL ?? "http://localhost:8000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      detail?: string;
    } | null;
    throw new Error(payload?.detail ?? `IDMS API returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const listProjects = () =>
  request<Project[]>("/projects", { cache: "no-store" });
export const createProject = (project: ProjectCreate) =>
  request<Project>("/projects", {
    method: "POST",
    body: JSON.stringify(project),
  });
export const getProject = (projectId: string) =>
  request<Project>(`/projects/${projectId}`, { cache: "no-store" });
export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(`${apiUrl}/projects/${projectId}`, {
    method: "DELETE",
  });
  // A repeated click can arrive after the first DELETE completed. In that
  // case a 404 means the intended end state has already been reached.
  if (!response.ok && response.status !== 404) {
    const payload = (await response.json().catch(() => null)) as {
      detail?: string;
    } | null;
    throw new Error(payload?.detail ?? `IDMS API returned ${response.status}`);
  }
}

/** A DELETE response can be lost while the API is restarting. Verify the
 * requested end state before showing the user a failure they cannot act on. */
export async function confirmProjectDeleted(
  projectId: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${apiUrl}/projects/${projectId}`, {
        cache: "no-store",
      });
      if (response.status === 404) return true;
      if (response.ok) return false;
    } catch {
      // The API may be transitioning between containers; retry briefly.
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return false;
}
export const listDocuments = (projectId: string) =>
  request<Document[]>(`/projects/${projectId}/documents`, {
    cache: "no-store",
  });
export async function deleteDocument(
  projectId: string,
  documentId: string,
): Promise<void> {
  const response = await fetch(
    `${apiUrl}/projects/${projectId}/documents/${documentId}`,
    { method: "DELETE" },
  );
  // A duplicate click after a completed delete means the intended state has
  // already been reached, so treat 404 as a successful idempotent delete.
  if (!response.ok && response.status !== 404) {
    throw new Error(`IDMS API returned ${response.status}`);
  }
}
export async function deleteGeneratedMerge(
  projectId: string,
  documentId: string,
): Promise<void> {
  const response = await fetch(
    `${apiUrl}/projects/${projectId}/merged-documents/${documentId}`,
    { method: "DELETE" },
  );
  // Deleting an already-deleted generated merge has reached the same end
  // state; a repeated browser event must not turn that into an error.
  if (!response.ok && response.status !== 404) {
    throw new Error(`IDMS API returned ${response.status}`);
  }
}

export const createUploadIntent = (
  projectId: string,
  file: File,
  checksum_sha256: string,
  role: "master_candidate" | "source",
) =>
  request<UploadIntent>(`/projects/${projectId}/documents/uploads`, {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      size_bytes: file.size,
      checksum_sha256,
      role,
    }),
  });

export async function uploadDocx(
  file: File,
  intent: UploadIntent,
): Promise<Document> {
  const upload = await fetch(intent.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    body: file,
  });
  if (!upload.ok) throw new Error(`Upload failed with ${upload.status}`);
  return request<Document>(
    `/documents/${intent.document_id}/uploads/complete`,
    { method: "POST", body: "{}" },
  );
}

export const selectMaster = (projectId: string, documentId: string) =>
  request<Document[]>(`/projects/${projectId}/master-document`, {
    method: "PUT",
    body: JSON.stringify({ document_id: documentId }),
  });
export const removeMaster = (projectId: string) =>
  request<Document[]>(`/projects/${projectId}/master-document`, {
    method: "PUT",
    body: JSON.stringify({ document_id: null }),
  });
export const getOutline = (documentId: string) =>
  request<OutlineNode[]>(`/documents/${documentId}/outline`, {
    cache: "no-store",
  });
export const createMergeJob = (
  projectId: string,
  operations: Array<{
    source_version_id: string;
    source_node_key: string;
    destination_node_key: string | null;
    position: "before" | "after";
    sort_order: number;
    resolution_options: {
      inherit_heading_format: boolean;
      adopt_heading_style: boolean;
      adopt_heading_font: boolean;
      adopt_heading_size: boolean;
      adopt_heading_colour: boolean;
      adopt_heading_emphasis: boolean;
      adopt_heading_paragraph_format: boolean;
      renumber_manual_headings: boolean;
      normalise_tables: boolean;
    };
  }>,
  metadata?: {
    generated_filename?: string;
    initial_description?: string;
  },
) =>
  request<Job>(`/projects/${projectId}/merge-jobs`, {
    method: "POST",
    body: JSON.stringify({ operations, ...metadata }),
  });
export const previewMerge = (
  projectId: string,
  operations: Array<{
    source_version_id: string;
    source_node_key: string;
    destination_node_key: string | null;
    position: "before" | "after";
    sort_order: number;
    resolution_options: {
      inherit_heading_format: boolean;
      adopt_heading_style: boolean;
      adopt_heading_font: boolean;
      adopt_heading_size: boolean;
      adopt_heading_colour: boolean;
      adopt_heading_emphasis: boolean;
      adopt_heading_paragraph_format: boolean;
      renumber_manual_headings: boolean;
      normalise_tables: boolean;
    };
  }>,
) =>
  request<MergePreview>(`/projects/${projectId}/merge-preview`, {
    method: "POST",
    body: JSON.stringify({ operations }),
  });
export const getMergeResults = (projectId: string) =>
  request<MergeResult[]>(`/projects/${projectId}/merge-results`, {
    cache: "no-store",
  });
export const startAnalysis = (documentId: string) =>
  request<Job>(`/documents/${documentId}/analysis`, {
    method: "POST",
    body: "{}",
  });
export const getJob = (jobId: string) =>
  request<Job>(`/jobs/${jobId}`, { cache: "no-store" });
export const listVersions = (documentId: string) =>
  request<DocumentVersion[]>(`/documents/${documentId}/versions`, {
    cache: "no-store",
  });
export const restoreVersion = (
  versionId: string,
  body: {
    expected_latest_version_id?: string;
    description?: string;
    created_by?: string;
  },
) =>
  request<DocumentVersion>(`/versions/${versionId}/restore`, {
    method: "POST",
    body: JSON.stringify(body),
  });
export const compareVersions = (
  documentId: string,
  baseVersionId: string,
  targetVersionId: string,
) =>
  request<VersionComparison>(
    `/documents/${documentId}/versions/compare?base_version_id=${baseVersionId}&target_version_id=${targetVersionId}`,
    { cache: "no-store" },
  );
