import type { DocumentVersion, Job } from "../../types/contracts";
import type {
  ExtractionPage,
  ExtractionRecord,
  ExtractionRevision,
  PageQuery,
  ProfileSnapshot,
} from "../../types/extractions";

const apiUrl = (process.env.NEXT_PUBLIC_IDMS_API_URL ?? "/api/v1").replace(
  /\/$/,
  "",
);
const segment = encodeURIComponent;

export class ExtractionApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  signal?: AbortSignal,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    signal,
    cache: "no-store",
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : `Request failed (${response.status}).`;
    throw new ExtractionApiError(response.status, detail);
  }
  return response.json() as Promise<T>;
}

export const extractionApi = {
  profiles: (signal?: AbortSignal) =>
    request<{
      items: {
        profileId: string;
        identifierRuleCount: number;
        placeholderGrammarCount: number;
      }[];
    }>("/extraction-profiles", signal),
  versions: (document: string, signal?: AbortSignal) =>
    request<DocumentVersion[]>(
      `/documents/${segment(document)}/versions`,
      signal,
    ),
  revisions: (version: string, signal?: AbortSignal) =>
    request<{ versionId: string; items: ExtractionRevision[] }>(
      `/versions/${segment(version)}/extractions?limit=100`,
      signal,
    ),
  revision: (revision: string, signal?: AbortSignal) =>
    request<ExtractionRevision>(`/extractions/${segment(revision)}`, signal),
  start: (version: string, profile: string, signal?: AbortSignal) =>
    request<ExtractionRevision>(
      `/versions/${segment(version)}/extractions`,
      signal,
      { profile_id: profile },
    ),
  profile: (revision: string, signal?: AbortSignal) =>
    request<ProfileSnapshot>(
      `/extractions/${segment(revision)}/profile`,
      signal,
    ),
  approvedProfile: (profile: string, signal?: AbortSignal) =>
    request<ProfileSnapshot>(
      `/extraction-profiles/${segment(profile)}`,
      signal,
    ),
  job: (job: string, signal?: AbortSignal) =>
    request<Job>(`/jobs/${segment(job)}`, signal),
  node: (revision: string, node: string, signal?: AbortSignal) =>
    request<{
      node: ExtractionRecord;
      analysisRevisionId: string;
      versionId: string;
    }>(`/extractions/${segment(revision)}/nodes/${segment(node)}`, signal),
  page: (
    revision: string,
    query: PageQuery,
    cursor: string | null,
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams({ limit: "25", ...query.filters });
    if (cursor) params.set("cursor", cursor);
    const suffix =
      query.route === "collections"
        ? `collections/${segment(query.collection)}`
        : query.route;
    return request<ExtractionPage>(
      `/extractions/${segment(revision)}/${suffix}?${params}`,
      signal,
    );
  },
  mediaUrl: (revision: string, asset: string) =>
    `${apiUrl}/extractions/${segment(revision)}/media/${segment(asset)}`,
};
