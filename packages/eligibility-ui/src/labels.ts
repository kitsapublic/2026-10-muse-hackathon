import type { Cell, JobState, Mode } from "@kitsa/eligibility-lab-client";

export type Classification = "passing" | "failing" | "unresolved";
export type CellStatus = "satisfied" | "failing" | "unresolved";

export const CLASSIFICATIONS: readonly Classification[] = ["passing", "unresolved", "failing"];

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  passing: "Meets every criterion",
  failing: "Fails a criterion",
  unresolved: "Unresolved",
};

export const CLASSIFICATION_HINTS: Record<Classification, string> = {
  passing: "Every inclusion criterion is met and every exclusion is established as absent.",
  failing: "At least one inclusion criterion is not met or one exclusion applies.",
  unresolved: "Nothing fails, but at least one criterion could not be decided from the record.",
};

export const MODE_LABELS: Record<Mode, string> = {
  reference: "Reference answers",
  recorded: "Recorded model",
  live: "Live model",
};

export const MODE_HINTS: Record<Mode, string> = {
  reference: "Authored reference interpretations and narrative answers. No model is involved.",
  recorded: "Genuine retained model responses, revalidated and rerun through the engine.",
  live: "New model requests, spending from the enabled experiment's budget.",
};

export const STATE_LABELS: Record<JobState, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Complete",
  partial: "Partial result",
  failed: "Failed",
  cancelled: "Cancelled",
};

const REASONS: Record<string, string> = {
  established: "established",
  not_applicable: "does not apply",
  insufficient_evidence: "insufficient evidence",
  conflicting_evidence: "conflicting evidence",
  unrecognized_unit: "unrecognized unit",
  unrecognized_code: "unrecognized code",
  model_abstention: "model abstained",
  unsupported_interpretation: "unsupported interpretation",
  narrative_decision_unavailable: "narrative answer unavailable",
  narrative_binding_mismatch: "narrative answer no longer matches its notes",
  evaluation_error: "evaluation error",
};

export const SOURCE_LABELS: Record<string, string> = {
  structured: "structured record",
  reference_narrative: "reference narrative answer",
  model_narrative: "model narrative answer",
};

export function reasonLabel(code: string): string {
  return REASONS[code] ?? code.replaceAll("_", " ");
}

export function cellLabel(cell: Cell): string {
  if (cell.outcome === "execution_failure") return "Not evaluated";
  return { yes: "Yes", no: "No", undetermined: "Undetermined" }[cell.value ?? "undetermined"];
}

export function cellDetail(cell: Cell): string {
  return [...cell.reasons, ...cell.failures].map(reasonLabel).join(", ");
}

/** The engine's own per-patient lists decide a cell's status; the UI never re-derives eligibility. */
export function cellStatus(criterionId: string, failing: readonly string[], unresolved: readonly string[]): CellStatus {
  if (failing.includes(criterionId)) return "failing";
  if (unresolved.includes(criterionId)) return "unresolved";
  return "satisfied";
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
}
