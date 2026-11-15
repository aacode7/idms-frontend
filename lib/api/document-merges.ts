import type { DocumentMerge } from "../../types/document-merges";

const api =
  process.env.NEXT_PUBLIC_IDMS_API_URL ?? "http://localhost:8000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}/document-merges${path}`, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = payload?.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((item: { msg: string }) => item.msg).join(" ")
          : "The merge request could not be completed. Please retry.",
    );
  }
  return response.json();
}

export const listDocumentMerges = () => request<DocumentMerge[]>("");
export const getDocumentMerge = (id: string) =>
  request<DocumentMerge>(`/${id}`);
export async function deleteDocumentMerge(id: string): Promise<void> {
  try {
    const response = await fetch(`${api}/document-merges/${id}`, {
      method: "DELETE",
    });
    if (response.ok || response.status === 404) return;
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload?.detail ?? "The merged document could not be deleted.",
    );
  } catch (error) {
    // A lost DELETE response may still have removed the merge successfully.
    try {
      const check = await fetch(`${api}/document-merges/${id}`, {
        cache: "no-store",
      });
      if (check.status === 404) return;
    } catch {
      /* Keep the original failure so the user can retry. */
    }
    throw error;
  }
}
export const createDocumentMerge = (name: string) =>
  request<DocumentMerge>("", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
export const startDocumentMerge = (id: string, versionIds: string[]) =>
  request<DocumentMerge>(`/${id}/jobs`, {
    method: "POST",
    body: JSON.stringify({ version_ids: versionIds }),
  });
export const documentMergeDownloadUrl = (id: string) =>
  `${api}/document-merges/${id}/download`;

export const mergeStageLabel = (status: string, stage: string) => {
  if (status === "draft") return "Ready for documents";
  if (status === "completed") return "Ready to view and download";
  if (status === "failed") return "Needs attention";
  return (
    (
      {
        queued: "Waiting for the merge worker…",
        parsing: "Checking and parsing documents…",
        merging: "Merging documents and renumbering headings…",
        refreshing_toc: "Updating tables of contents and page numbers…",
        persisting: "Saving the merged document…",
      } as Record<string, string>
    )[stage] ?? "Processing documents…"
  );
};
