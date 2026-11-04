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
  role: "master_candidate" | "master" | "source";
  status: "uploaded";
  version_id: string;
  created_at: string;
};
