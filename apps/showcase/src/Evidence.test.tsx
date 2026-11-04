import type { Cell, PatientRecord, PatientResult, Result } from "@kitsa/eligibility-lab-client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PatientEvidence } from "./Evidence";

const cell = (value: Cell["value"], evidence: string[]): Cell => ({ outcome: "decision", value, evidence, reasons: ["established"], failures: [], narrative_decisions: [], sources: ["structured"], applicability: "unconditional" });
const criteria: Result["criteria"] = [
  { criterion_id: "I1", category: "inclusion", text: "Age 18 to 75 years, inclusive, on the date of eligibility assessment.", anchor: "5.1.1", parameters: {age_min:18,age_max:80}, interpretation: "executable", rule_digest: "new", baseline_rule_digest: "old" },
  { criterion_id: "E1", category: "exclusion", text: "Active infection requiring systemic antimicrobial therapy at the time of eligibility assessment.", anchor: "5.2.1", parameters: {}, interpretation: "executable", rule_digest: "same", baseline_rule_digest: "same" },
];
const record: PatientRecord = { bundle_key: "test", patient_id: "P1", reference_date: "2026-10-27", patient_digest: "d", cohort: {cohort_id:"c",version:"1",digest:"d"},
  evidence: [{ evidence_id: "birth", concept: "birth_date", value: "1948-05-02", observed_on: "2026-04-10", encounter_id: null, status: "final", provenance: {source_kind:"structured",origin:"synthetic"} }],
  notes: [{ note_id: "note", written_on: "2026-10-24", encounter_id: null, text: "No signs of infection and not receiving antimicrobials.", provenance: {source_kind:"note",origin:"synthetic"} }],
};
const decision: PatientResult = { patient_id:"P1", classification:"passing", failing_criteria:[], unresolved_criteria:[], cells:{I1:cell("yes",["birth"]),E1:cell("no",["note"])} };

describe("patient eligibility explanation", () => {
  it("shows active scenario thresholds, draft comparison and the cited EHR values", () => {
    const baseline = {...decision, classification:"failing" as const, failing_criteria:["I1"], cells:{...decision.cells,I1:cell("no",["birth"])}};
    render(<PatientEvidence record={record} decision={decision} criteria={criteria} baselineDecision={baseline} baselineCriteria={criteria.map(c => c.criterion_id === "I1" ? {...c,parameters:{age_min:18,age_max:75}} : c)}/>);
    const age = screen.getByRole("row",{name:/Age at assessment/});
    expect(within(age).getByText("Age 18 to 80 years, inclusive, on the date of eligibility assessment.")).toBeVisible();
    expect(within(age).getByText(/Draft: Age 18 to 75/)).toBeVisible();
    expect(age).toHaveTextContent("78 years at assessment");
    expect(within(age).getByText("Does not meet criterion")).toBeVisible();
    expect(within(age).getByText("Meets criterion")).toBeVisible();
    const infection = screen.getByRole("row",{name:/Active infection requiring treatment/});
    expect(infection).toHaveTextContent(record.notes[0]!.text);
    expect(within(infection).getAllByText("Exclusion does not apply")).toHaveLength(2);
  });
  it("distinguishes an exclusion that applies from an unresolved criterion", () => {
    const unresolved: PatientResult = {...decision, classification:"failing", failing_criteria:["E1"], unresolved_criteria:["I1"], cells:{I1:{...cell("undetermined",[]),reasons:["insufficient_evidence"]},E1:cell("yes",["note"])}};
    render(<PatientEvidence record={record} decision={unresolved} criteria={criteria}/>);
    expect(screen.getByRole("row",{name:/Age at assessment/})).toHaveTextContent("Unresolved");
    expect(screen.getByRole("row",{name:/Active infection requiring treatment/})).toHaveTextContent("Exclusion applies");
    expect(screen.queryByText("Meets criterion")).not.toBeInTheDocument();
  });
});
