import type { Cell, Comparison, Proposal, Result } from "@kitsa/eligibility-lab-client";

/** Small hand-written results shaped exactly like the service's, for component tests only. */
const yes: Cell = {
  outcome: "decision", value: "yes", reasons: ["established"], failures: [], applicability: "unconditional",
  evidence: ["E1"], narrative_decisions: [], sources: ["structured"],
};
const no: Cell = { ...yes, value: "no", evidence: ["E2"] };
const unknown: Cell = { ...yes, value: "undetermined", reasons: ["insufficient_evidence"], evidence: [], sources: [] };
const broken: Cell = {
  outcome: "execution_failure", value: null, reasons: [], failures: ["narrative_decision_unavailable"],
  applicability: "unconditional", evidence: [], narrative_decisions: [], sources: [],
};
const narrativeNo: Cell = { ...no, evidence: ["N1"], narrative_decisions: ["Q1"], sources: ["model_narrative"] };

const summary = (patients: number) => ({
  patients,
  age_bands: { under_18: 0, "18_49": 0, "50_64": patients, "65_74": 0, "75_79": 0, "80_plus": 0, unknown: 0 },
  sex: { female: patients, male: 0, unknown: 0 },
});

export function result(overrides: Partial<Result> = {}): Result {
  return {
    format: "kitsa/eligibility-lab-result/1",
    run_id: "run-1",
    run: {
      bundle: { bundle_id: "b", bundle_version: "1" }, protocol: {}, criterion_set: {}, cohort: {}, narrative: {},
      evaluation_date: "2026-10-27",
      scenario: { scenario_id: "baseline", title: "Protocol criteria", author: null, edits: [] },
      waterfall_order: ["I1", "E1"], interpreter: {}, normalizer: {}, evaluator: {}, workspace: "local-synthetic",
    },
    criteria: [
      { criterion_id: "I1", category: "inclusion", text: "Age 18 to 75.", anchor: "5.1.1", interpretation: "executable",
        parameters: { age_max: 75 }, rule_digest: "r1", baseline_rule_digest: "r1" },
      { criterion_id: "E1", category: "exclusion", text: "Active infection.", anchor: "5.2.1",
        interpretation: "executable", parameters: {}, rule_digest: "r2", baseline_rule_digest: "r2" },
    ],
    patients: [
      { patient_id: "P1", classification: "passing", failing_criteria: [], unresolved_criteria: [],
        cells: { I1: yes, E1: narrativeNo } },
      { patient_id: "P2", classification: "failing", failing_criteria: ["I1"], unresolved_criteria: ["E1"],
        cells: { I1: no, E1: unknown } },
      { patient_id: "P3", classification: "unresolved", failing_criteria: [], unresolved_criteria: ["E1"],
        cells: { I1: yes, E1: broken } },
    ],
    counts: { passing: 1, failing: 1, unresolved: 1, total: 3 },
    coverage: {
      cells: 6, decided: 4, undetermined: 1, execution_failures: 1, complete: false,
      by_criterion: { I1: { yes: 2, no: 1, undetermined: 0, execution_failure: 0 },
                      E1: { yes: 0, no: 1, undetermined: 1, execution_failure: 1 } },
      undetermined_reasons: { insufficient_evidence: 1 },
    },
    waterfall: {
      order: ["I1", "E1"], denominator: 3,
      steps: [{ criterion_id: "I1", passing: 2, failing: 1, unresolved: 0, newly_failing: 1 },
              { criterion_id: "E1", passing: 1, failing: 1, unresolved: 1, newly_failing: 0 }],
    },
    criterion_impact: [
      { criterion_id: "I1", failing: 1, passing_if_waived: 1, gain: 0, gained_patients: [] },
      { criterion_id: "E1", failing: 0, passing_if_waived: 1, gain: 0, gained_patients: [] },
    ],
    summaries: { cohort: summary(3), passing: summary(1), failing: summary(1), unresolved: summary(1) },
    content_digest: "digest-1",
    execution_metrics: { elapsed_us: 1234, decisions_computed: 6, decisions_reused: 0, patients: 3, criteria: 2,
                         cells: 6 },
    ...overrides,
  };
}

export const comparison: Comparison = {
  format: "kitsa/eligibility-lab-comparison/1",
  baseline: { run_id: "run-1", content_digest: "d1", counts: { passing: 1, failing: 1, unresolved: 1, total: 3 } },
  scenario: { run_id: "run-2", content_digest: "d2", counts: { passing: 1, failing: 0, unresolved: 2, total: 3 },
              scenario_id: "scenario-a", title: "Upper age 80", author: "tests",
              edits: [{ criterion_id: "I1", parameter: "age_max", value: 80 }] },
  evaluation_date: "2026-10-27", complete: false,
  changed_criteria: [{ criterion_id: "I1", edits: [{ parameter: "age_max", from: 75, to: 80 }],
                       baseline_rule_digest: "r1", scenario_rule_digest: "r3" }],
  passing_delta: 0,
  transitions: { "passing->passing": 1, "passing->failing": 0, "passing->unresolved": 0, "failing->passing": 0,
                 "failing->failing": 0, "failing->unresolved": 1, "unresolved->passing": 0,
                 "unresolved->failing": 0, "unresolved->unresolved": 1 },
  changed_patients: [{ patient_id: "P2", from: "failing", to: "unresolved",
                       changed_criteria: [{ criterion_id: "I1", from: "no", to: "yes" }] }],
  summaries: { baseline: { passing: summary(1) }, scenario: { passing: summary(1) } },
  content_digest: "c1",
  execution_metrics: {
    elapsed_us: 10,
    baseline: { elapsed_us: 5, decisions_computed: 6, decisions_reused: 0, patients: 3, criteria: 2, cells: 6 },
    scenario: { elapsed_us: 5, decisions_computed: 3, decisions_reused: 3, patients: 3, criteria: 2, cells: 6 },
  },
};

export function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    proposal_id: "prp-1", criterion_id: "I1", origin: "reference",
    interpreter: { kind: "reference", name: "reference", version: "1" },
    interpretation: {
      status: "executable", rule_version: 1, applicability: null,
      parameters: { age_max: { type: "integer", value: 75, editable: true, minimum: 18, maximum: 100 } },
      requirement: { op: "age", comparator: "le", value: { param: "age_max" } },
    },
    questions: {}, valid: true, problems: [], parent_id: null, attempt_id: null, author: "bundle reference",
    created_at: "2026-10-27T00:00:00Z",
    criterion: { bundle_key: "b@1", criterion_id: "I1", category: "inclusion", text: "Age 18 to 75.", anchor: "5.1.1",
                 protocol: {}, criterion_set: {} },
    review: null,
    ...overrides,
  };
}
