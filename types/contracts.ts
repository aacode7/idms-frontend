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
  analysis_status:
    "not_started" | "queued" | "running" | "completed" | "failed";
  extraction_status?:
    | "not_started"
    | "queued"
    | "running"
    | "retry_wait"
    | "completed"
    | "failed";
  extraction_stage?: string | null;
  extraction_error_code?: string | null;
  extraction_validated_records?: number | null;
  extraction_total_records?: number | null;
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

export type OutlineNode = {
  automatic_label?: string | null;
  label_status?: string;
  display_title?: string | null;
  node_key: string;
  title: string;
  level: number;
  parent_node_key: string | null;
  block_index: number;
  end_block_index: number;
};
export type Job = {
  id: string;
  kind: string;
  status: string;
  stage: string;
  error_code: string | null;
  download_url: string | null;
};
export type Diagnostic = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  operation_index: number | null;
  resolution_key: string | null;
  resolution_label: string | null;
  resolution_default: boolean | null;
  resolution_required: boolean;
  source_value: string | null;
  master_value: string | null;
  merge_effect: string | null;
};
export type MergePreview = { warnings: string[]; diagnostics: Diagnostic[] };
export type SourceSectionChoice = {
  node_key: string;
  content: "section" | "heading";
};

export type MergeResult = {
  generated_version_id: string;
  generated_document_id: string;
  generated_version_number?: number;
  insertions?: {
    source_version_id: string;
    source_node_key: string;
    source_title?: string | null;
    source_filename?: string | null;
    source_version_number?: number | null;
    destination_node_key?: string | null;
    destination_title?: string | null;
    destination_parent_title?: string | null;
    position: "before" | "after";
    heading_mode: "same" | "chapter" | "parent";
    included_sections?:
      | (SourceSectionChoice & {
          title?: string | null;
          level?: number | null;
          parent_node_key?: string | null;
        })[]
      | null;
    excluded_sections?: string[];
  }[];
  source_node_keys: string[];
  editor_anchor_ids: string[];
  preservation_status?: string;
  toc_refresh_status?: string;
};

export type DocumentVersion = {
  id: string;
  version_number: number;
  created_at: string;
  created_by: string;
  description: string | null;
  parent_version_id: string | null;
  is_latest: boolean;
  download_url: string;
  comparison: VersionComparison | null;
};

export type VersionComparison = {
  base_version_id: string;
  target_version_id: string;
  base_version_number: number;
  target_version_number: number;
  changed: boolean;
  diff: string[];
};
