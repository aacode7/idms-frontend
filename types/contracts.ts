export type Project = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  document_count: number;
};

export type ProjectCreate = Pick<Project, "name"> & { description?: string };

export type Document = {
  id: string;
  project_id: string;
  filename: string;
  size_bytes: number;
  role: "master_candidate" | "master" | "source" | "generated";
  status: "upload_pending" | "uploaded";
  version_id: string;
  created_at: string;
};

export type UploadIntent = {
  document_id: string;
  version_id: string;
  object_key: string;
  upload_url: string;
  expires_in_seconds: number;
};

export type OutlineNode = { node_key: string; title: string; level: number; parent_node_key: string | null; block_index: number; end_block_index: number };
export type Job = { id: string; kind: string; status: string; stage: string; error_code: string | null };
