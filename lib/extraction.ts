import type { ExtractionRecord, Json } from "../types/extractions";

export const object = (value: Json | undefined): ExtractionRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
export const text = (value: Json | undefined): string =>
  typeof value === "string" ? value : "";
export const fields = (record: ExtractionRecord) => ({
  ...record,
  ...object(record.details),
});
export function automaticLabelText(record: ExtractionRecord): string {
  if (typeof record.automaticLabel === "string") return record.automaticLabel;
  if (record.labelStatus === "not_numbered") return "Not numbered";
  if (record.labelStatus === "cancelled") return "Numbering cancelled";
  if (record.labelStatus === "unresolved") return "Unresolved";
  return "No automatic label recorded";
}
export const recordId = (record: ExtractionRecord): string => {
  const r = fields(record);
  for (const key of [
    "semanticId",
    "headingId",
    "tokenId",
    "assetId",
    "numberingLabelId",
    "nodeId",
    "storyId",
    "definitionId",
    "propertySetId",
  ]) {
    if (text(r[key])) return text(r[key]);
  }
  return "";
};

// Engine offsets are Unicode code points, not JS UTF-16 code units.
export function codePointSlice(
  value: string,
  start: number,
  end: number,
): string {
  const points = Array.from(value);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end > points.length
  )
    throw new Error("Invalid source span.");
  return points.slice(start, end).join("");
}

export function assertPinnedPage(
  page: {
    analysisRevisionId: string;
    versionId: string;
    sourceHash: string;
    collection: string;
  },
  pin: { analysisRevisionId: string; versionId: string; sourceHash: string },
  collection: string,
) {
  if (
    page.analysisRevisionId !== pin.analysisRevisionId ||
    page.versionId !== pin.versionId ||
    page.sourceHash !== pin.sourceHash ||
    page.collection !== collection
  )
    throw new Error(
      "The response does not match the selected extraction. Reload this revision.",
    );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Extraction data could not be loaded.";
}
