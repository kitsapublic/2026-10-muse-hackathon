import type { EvidenceRecord, PatientRecord, Result } from "@kitsa/eligibility-lab-client";

type Criterion = Pick<Result["criteria"][number], "text">;
export function criterionName(criterion: Criterion): string {
  const text = criterion.text;
  const names: [RegExp, string][] = [
    [/^Age\b/i, "Age at assessment"],
    [/Histologically|cytologically/i, "Confirmed NSCLC diagnosis"],
    [/Locally advanced disease/i, "Disease stage and treatment intent"],
    [/Eastern Cooperative|ECOG/i, "ECOG performance status"],
    [/Absolute neutrophil/i, "Absolute neutrophil count"],
    [/Haemoglobin/i, "Haemoglobin"],
    [/prior systemic anticancer treatment regimens/i, "Prior systemic anticancer regimens"],
    [/last dose.*days/i, "Time since last systemic therapy"],
    [/Active infection/i, "Active infection requiring treatment"],
    [/central nervous system|CNS/i, "CNS metastases"],
  ];
  return names.find(([pattern]) => pattern.test(text))?.[1] ?? text;
}

/** Scenario results retain the original protocol text, so display the selected parameter values explicitly. */
export function criterionStatement(criterion: Result["criteria"][number]): string {
  const p = criterion.parameters;
  if (/^Age\b/i.test(criterion.text) && p.age_max !== undefined) {
    return `Age ${p.age_min ?? 18} to ${p.age_max} years, inclusive, on the date of eligibility assessment.`;
  }
  if (/prior systemic anticancer treatment regimens/i.test(criterion.text) && p.max_regimens !== undefined) {
    return `No more than ${p.max_regimens} prior systemic anticancer treatment regimens.`;
  }
  return criterion.text;
}

const conceptNames: Record<string, string> = {
  birth_date: "Date of birth", sex: "Sex", nsclc_histology: "NSCLC histology",
  disease_stage: "Disease stage", ecog: "ECOG performance status", neutrophils: "Absolute neutrophil count",
  haemoglobin: "Haemoglobin", systemic_anticancer_regimen: "Systemic anticancer regimen",
  systemic_therapy_history_complete: "Treatment history reviewed as complete",
};
export const evidenceName = (concept: string) => conceptNames[concept] ?? concept.replaceAll("_", " ");
export function evidenceValue(evidence: EvidenceRecord, referenceDate: string): string {
  const v = evidence.value;
  if (evidence.concept === "birth_date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const age = Number(referenceDate.slice(0, 4)) - Number(v.slice(0, 4)) - (referenceDate.slice(5) < v.slice(5) ? 1 : 0);
    return `${v} · ${age} years at assessment`;
  }
  if (typeof v === "object" && "amount" in v) return `${v.amount} ${v.unit === "10*9/L" ? "× 10⁹/L" : v.unit}`;
  if (typeof v === "object" && "regimen_id" in v) return `${v.regimen_id}: ${v.state}; started ${v.start_on}; last dose ${v.last_dose_on ?? "not recorded"}`;
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}
export function currentEvidence(record: PatientRecord): EvidenceRecord[] {
  return record.evidence.filter(e => e.status !== "entered_in_error" && e.observed_on <= record.reference_date);
}
