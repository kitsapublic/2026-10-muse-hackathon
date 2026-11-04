import type { BundleDetail, JobComparison, JobResult, Result } from "@kitsa/eligibility-lab-client";
import history from "../../../evidence/benchmark-summary.json";
import source from "../../../evidence/story-source.json";
import comparison from "../../../evidence/model-comparison.json";
export { history, source, comparison };

export const SCENES = [
  { id: "question", label: "Design the eligibility criteria", title: "Simulate Clinical Trials", next: "Read the patient’s EHR" },
  { id: "muse", label: "Read the patient’s EHR", title: "Turn a patient’s EHR into eligibility evidence.", next: "Evaluate the draft criteria" },
  { id: "baseline", label: "Evaluate the draft criteria", title: "Find out which patients meet the trial’s eligibility criteria.", next: "Optimize eligibility criteria" },
  { id: "scenarios", label: "Optimize eligibility criteria", title: "Optimize eligibility criteria to maximize the eligible population.", next: "Compare the eligible populations" },
  { id: "evidence", label: "Compare eligible populations", title: "Measure how each eligibility change affects the population.", next: "Review the proposed criteria" },
  { id: "review", label: "Review the proposed criteria", title: "Take evidence-backed eligibility criteria into protocol review.", next: "Export review package" },
] as const;
export type Scene = typeof SCENES[number]["id"];
export const sceneIndex = (value: string | null) => Math.max(0, SCENES.findIndex((s) => s.id === value));
export const isStoryBundle = (detail: BundleDetail | null) => detail?.bundle_key === source.bundle_key &&
  detail.manifest_sha256 === source.manifest_sha256;
export const scenarioNames: Record<string, string> = {
  "scenario-a": "Age limit: 75 → 80 years", "scenario-b": "Prior systemic regimens: 2 → 3", "scenario-ab": "Age 80 + up to 3 prior regimens",
};
export const money = (micro: number) => "$" + (micro / 1_000_000).toFixed(4);
export const count = (n: number) => n.toLocaleString("en-GB");
export const statusLabels: Record<string, string> = { passing: "Eligible", failing: "Not eligible", unresolved: "Eligibility unresolved" };
export const pretty = (s: string) => s.replaceAll("_", " ");

export function interactionGroups(baseline: Result, a: Result, b: Result, both: Result) {
  const pass = (r: Result) => new Set(r.patients.filter((p) => p.classification === "passing").map((p) => p.patient_id));
  const before = pass(baseline), age = pass(a), regimens = pass(b), together = pass(both);
  const groups = { ageOnly: [] as string[], regimenOnly: [] as string[], either: [] as string[], bothRequired: [] as string[] };
  for (const patient of together) {
    if (before.has(patient)) continue;
    groups[age.has(patient) ? (regimens.has(patient) ? "either" : "ageOnly") : (regimens.has(patient) ? "regimenOnly" : "bothRequired")].push(patient);
  }
  return groups;
}

export function reviewDocument(detail: BundleDetail, baseline: JobResult, scenario: JobResult, compared: JobComparison,
  downloads: (job: string) => { report: string; matrix: string; comparison: string }) {
  if (compared.baseline_job_id !== baseline.job.job_id || scenario.job.baseline_job_id !== baseline.job.job_id ||
      compared.job.job_id !== scenario.job.job_id || baseline.job.bundle_key !== detail.bundle_key ||
      scenario.job.bundle_key !== detail.bundle_key || compared.comparison.baseline.run_id !== baseline.result.run_id ||
      compared.comparison.scenario.run_id !== scenario.result.run_id) throw new Error("Select a scenario on this baseline before exporting.");
  return {
    format: "kitsa/eligibility-lab-feasibility-review/1", purpose: "This package supports a protocol feasibility discussion. A reviewer must decide whether the proposed changes are appropriate.",
    bundle: { key: detail.bundle_key, manifest_sha256: detail.manifest_sha256 },
    protocol: detail.protocol.protocol_id, evaluation_date: baseline.job.evaluation_date, mode: baseline.job.mode,
    baseline: { job_id: baseline.job.job_id, run_id: baseline.result.run_id, content_digest: baseline.result.content_digest, counts: baseline.result.counts },
    scenario: { job_id: scenario.job.job_id, run_id: scenario.result.run_id, content_digest: scenario.result.content_digest,
      title: compared.comparison.scenario.title, edits: compared.comparison.scenario.edits, counts: scenario.result.counts },
    changed_patients: compared.comparison.changed_patients,
    unresolved: scenario.result.patients.filter((p) => p.classification === "unresolved").map((p) => ({ patient_id: p.patient_id,
      criteria: p.unresolved_criteria.map((id) => ({ criterion_id: id, reasons: p.cells[id]?.reasons ?? [], failures: p.cells[id]?.failures ?? [],
        evidence: p.cells[id]?.evidence ?? [], narrative_decisions: p.cells[id]?.narrative_decisions ?? [] })) })),
    actions: ["Review the scientific and safety rationale for the selected threshold changes.",
      "Resolve the listed missing or conflicting evidence before considering individual eligibility.",
      "Validate on independent protocols and data before any real-world use."],
    limitations: ["This demonstration uses an invented protocol and synthetic patients. Clinical validation would require separate work.",
      "Counts come from the selected runs; model benchmark results are separate historical measurements.",
      "Population-scale screening would require further development and capacity testing."],
    exports: { baseline: downloads(baseline.job.job_id), scenario: downloads(scenario.job.job_id) },
  };
}

export function saveJson(document: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2) + "\n"], { type: "application/json" }));
  const anchor = window.document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
