export type DocumentMerge = {
  id: string;
  name: string;
  created_at: string;
  status: "draft" | "queued" | "running" | "completed" | "failed";
  stage: string;
  job_id: string | null;
  error_code: string | null;
  error_message: string | null;
  inputs: Array<{
    document_id: string;
    version_id: string;
    filename: string;
    status: string;
  }>;
  document_id: string | null;
  version_id: string | null;
  toc_count: number | null;
  heading_count: number | null;
};
