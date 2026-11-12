export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export type ExtractionRecord = { [key: string]: Json };

export type ExtractionRevision = {
  analysisRevisionId: string;
  projectId: string;
  documentId: string;
  versionId: string;
  sourceHash: string;
  extractionKey: string;
  parserBuildId: string;
  schemaVersion: string;
  identityVersion: string;
  profileId: string;
  supportProfileVersion: string;
  profileDigest: string;
  status: "queued" | "running" | "retry_wait" | "completed" | "failed";
  publicationStatus: "complete" | "unpublished";
  coverageStatus: string | null;
  jobId: string | null;
  attemptCount: number;
  retryAfter: string | null;
  retryable: boolean;
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
  summary: {
    counts?: Record<string, number>;
    diagnosticSummary?: Record<string, number>;
    collections?: Record<string, { recordCount: number; shardCount: number }>;
    semanticDigest?: string;
    locatorEncoding?: string;
  };
};

export type ExtractionPage = {
  analysisRevisionId: string;
  versionId: string;
  sourceHash: string;
  coverageStatus: string;
  collection: string;
  items: ExtractionRecord[];
  nextCursor: string | null;
};

export type ProfileSnapshot = {
  profileId: string;
  profileDigest: string;
  profile: ExtractionRecord;
  analysisRevisionId?: string;
  versionId?: string;
};

export const COLLECTION_GROUPS = {
  "Text and structure": [
    "stories",
    "nodes",
    "tokens",
    "paragraphFacts",
    "sections",
    "storyUsages",
  ],
  "Styles and numbering": [
    "headings",
    "numberingLabels",
    "formatting",
    "styles",
    "propertySets",
    "definitions",
  ],
  "Tables and media": [
    "tables",
    "rows",
    "cells",
    "mediaAssets",
    "imageOccurrences",
    "drawings",
    "alternatives",
  ],
  "TOC and fields": [
    "tocs",
    "tocEntries",
    "tocCandidates",
    "tocEntryChecks",
    "fields",
    "fieldSegments",
    "bookmarks",
    "hyperlinks",
    "references",
    "semanticLinks",
    "contentControls",
    "annotations",
    "customXmlStores",
  ],
  "Identifiers and boundaries": [
    "recognitionRules",
    "identifierOccurrences",
    "identifierValues",
    "identifierReferences",
    "placeholders",
    "delimiters",
    "boundaryEvents",
    "blankGroups",
  ],
  "Coverage and package": ["diagnostics", "coverage", "parts", "relationships"],
} as const;

export type Collection =
  (typeof COLLECTION_GROUPS)[keyof typeof COLLECTION_GROUPS][number];
export type PageQuery = {
  route: "outline" | "nodes" | "collections";
  collection: Collection;
  filters?: Record<string, string>;
};
