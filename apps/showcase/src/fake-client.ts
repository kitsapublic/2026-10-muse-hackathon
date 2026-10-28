/** An in-memory stand-in for the service, for the showcase's component tests only. */
import {
  type BundleDetail,
  type Cell,
  type Comparison,
  EligibilityLabError,
  type EligibilityLabClient,
  type Job,
  type JobComparison,
  type JobRequest,
  type JobResult,
  type Proposal,
  type Result,
  type Session,
} from "@kitsa/eligibility-lab-client";

const yes: Cell = { outcome: "decision", value: "yes", reasons: ["established"], failures: [],
                    applicability: "unconditional", evidence: ["E1"], narrative_decisions: [], sources: ["structured"] };
const no: Cell = { ...yes, value: "no" };
const summary = (patients: number) => ({
  patients, age_bands: { "50_64": patients, unknown: 0 }, sex: { female: patients, male: 0, unknown: 0 },
});

export function makeResult(runId: string, passing: string[], failing: string[]): Result {
  const patients = [...passing.map((id) => ({ id, ok: true })), ...failing.map((id) => ({ id, ok: false }))]
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    format: "kitsa/eligibility-lab-result/1", run_id: runId,
    run: { bundle: {}, protocol: {}, criterion_set: {}, cohort: {}, narrative: {}, evaluation_date: "2026-10-27",
           scenario: { scenario_id: "baseline", title: "Protocol criteria", author: null, edits: [] },
           waterfall_order: ["I1", "E1"], interpreter: {}, normalizer: {}, evaluator: {}, workspace: "local-synthetic" },
    criteria: [
      { criterion_id: "I1", category: "inclusion", text: "Age 18 to 75.", anchor: "5.1.1", interpretation: "executable",
        parameters: { age_max: 75 }, rule_digest: "r1", baseline_rule_digest: "r1" },
      { criterion_id: "E1", category: "exclusion", text: "Active infection.", anchor: "5.2.1",
        interpretation: "executable", parameters: {}, rule_digest: "r2", baseline_rule_digest: "r2" },
    ],
    patients: patients.map(({ id, ok }) => ({
      patient_id: id, classification: ok ? "passing" : "failing", failing_criteria: ok ? [] : ["I1"],
      unresolved_criteria: [], cells: { I1: ok ? yes : no, E1: no },
    })),
    counts: { passing: passing.length, failing: failing.length, unresolved: 0, total: patients.length },
    coverage: { cells: patients.length * 2, decided: patients.length * 2, undetermined: 0, execution_failures: 0,
                complete: true, by_criterion: {}, undetermined_reasons: {} },
    waterfall: { order: ["I1", "E1"], denominator: patients.length, steps: [
      { criterion_id: "I1", passing: passing.length, failing: failing.length, unresolved: 0,
        newly_failing: failing.length },
      { criterion_id: "E1", passing: passing.length, failing: failing.length, unresolved: 0, newly_failing: 0 }] },
    criterion_impact: [{ criterion_id: "I1", failing: failing.length, passing_if_waived: patients.length,
                         gain: failing.length, gained_patients: failing },
                       { criterion_id: "E1", failing: 0, passing_if_waived: passing.length, gain: 0,
                         gained_patients: [] }],
    summaries: { cohort: summary(patients.length), passing: summary(passing.length), failing: summary(failing.length),
                 unresolved: summary(0) },
    content_digest: `digest-${runId}`,
    execution_metrics: { elapsed_us: 900, decisions_computed: patients.length * 2, decisions_reused: 0,
                         patients: patients.length, criteria: 2, cells: patients.length * 2 },
  };
}

export const session: Session = {
  action_token: "token", operator: "local-operator", workspace: "local-synthetic", service_version: "0.2.0",
  evaluator: { name: "kitsa-eligibility-lab", version: "0.2.0" },
  modes: {
    reference: { available: true, reason: null, label: "Reference" },
    recorded: { available: false, reason: "No genuine model responses have been retained yet.", label: "Recorded" },
    live: { available: false, reason: "Live mode is disabled.", label: "Live" },
  },
};

export const bundle: BundleDetail = {
  bundle_key: "elx@1", bundle_id: "elx", bundle_version: "1", manifest_sha256: "m", installed_at: "now",
  identities: { protocol: "p", criteria: "c", cohort: "h", narrative: "n", patients: 4, criteria_count: 2,
                reference_date: "2026-10-27" },
  protocol: { protocol_id: "ELX-NSCLC-01", version: "1.0", title: "An invented protocol.", passages: [
    { anchor: "5.1.1", heading: null, text: "Age 18 to 75." },
    { anchor: "5.2.1", heading: null, text: "Active infection." },
    { anchor: "5.3.1", heading: null, text: "Windows include their first day." }] },
  criteria: [{ criterion_id: "I1", category: "inclusion", text: "Age 18 to 75.", anchor: "5.1.1" },
             { criterion_id: "E1", category: "exclusion", text: "Active infection.", anchor: "5.2.1" }],
  questions: [{ question_id: "infection", statement: "The patient has an active infection." }],
  scenarios: [{ scenario_id: "scenario-a", title: "Raise the upper age limit", author: "reference",
                edits: [{ criterion_id: "I1", parameter: "age_max", value: 80 }] }],
  scenario_parameters: [{ criterion_id: "I1", parameter: "age_max", type: "integer", value: 75, minimum: 18,
                          maximum: 100 }],
  cohort: { cohort_id: "cohort", version: "1", patients: 4, digest: "h" },
  narrative_source: { kind: "reference", description: "Reference narrative decisions." },
};

function proposal(criterion: "I1" | "E1"): Proposal {
  return {
    proposal_id: `prp-${criterion}`, criterion_id: criterion, origin: "reference",
    interpreter: { kind: "reference", name: "reference", version: "1" },
    interpretation: criterion === "I1"
      ? { status: "executable", rule_version: 1, applicability: null,
          parameters: { age_max: { type: "integer", value: 75, editable: true, minimum: 18, maximum: 100 } },
          requirement: { op: "age", comparator: "le", value: { param: "age_max" } } }
      : { status: "executable", rule_version: 1, applicability: null, parameters: {},
          requirement: { op: "narrative", question: "infection", window_days: 14 } },
    questions: {}, valid: true, problems: [], parent_id: null, attempt_id: null, author: "bundle reference",
    created_at: "now",
    criterion: { bundle_key: "elx@1", criterion_id: criterion, category: criterion === "I1" ? "inclusion" : "exclusion",
                 text: "", anchor: "", protocol: {}, criterion_set: {} },
    review: null,
  };
}

export function job(jobId: string, overrides: Partial<Job> = {}): Job {
  return {
    job_id: jobId, kind: "baseline", mode: "reference", mode_label: "Reference", bundle_key: "elx@1", set_id: "set",
    baseline_job_id: null, experiment_id: null, evaluation_date: "2026-10-27", configuration_sha256: "configuration",
    scenario: null, criterion_ids: null,
    state: "succeeded", cancel_requested: false, generation: 1, error: null,
    progress: { pending: 0, dispatched: 0, answered: 0, failed: 0, ambiguous: 0, skipped: 0, total: 0 },
    result: null, created_at: "now", updated_at: "now", finished_at: "now", ...overrides,
  };
}

export function comparisonFor(jobId: string, passingAfter: number): JobComparison {
  const doc: Comparison = {
    format: "kitsa/eligibility-lab-comparison/1",
    baseline: { run_id: "run-base", content_digest: "d", counts: { passing: 2, failing: 2, unresolved: 0, total: 4 } },
    scenario: { run_id: `run-${jobId}`, content_digest: "d2",
                counts: { passing: passingAfter, failing: 4 - passingAfter, unresolved: 0, total: 4 },
                scenario_id: "scenario-a", title: "Raise the upper age limit", author: "reference",
                edits: [{ criterion_id: "I1", parameter: "age_max", value: 80 }] },
    evaluation_date: "2026-10-27", complete: true, changed_criteria: [], passing_delta: passingAfter - 2,
    transitions: { "failing->passing": passingAfter - 2, "passing->passing": 2, "failing->failing": 4 - passingAfter },
    changed_patients: [], summaries: { baseline: {}, scenario: {} }, content_digest: "c",
    execution_metrics: { elapsed_us: 1,
      baseline: { elapsed_us: 1, decisions_computed: 1, decisions_reused: 0, patients: 4, criteria: 2, cells: 8 },
      scenario: { elapsed_us: 1, decisions_computed: 1, decisions_reused: 0, patients: 4, criteria: 2, cells: 8 } },
  };
  return { job: job(jobId, { kind: "scenario", baseline_job_id: "job-base" }), baseline_job_id: "job-base",
           comparison: doc };
}

/** A fake service: reviews and jobs change its state; every method can be overridden per test. */
export function fakeClient(overrides: Partial<EligibilityLabClient> = {}) {
  const proposals = [proposal("I1"), proposal("E1")];
  const jobs = new Map<string, Job>();
  const results = new Map<string, JobResult>();
  let counter = 0;
  const baseResult = makeResult("run-base", ["P1", "P2"], ["P3", "P4"]);
  const addBaseline = (jobId: string) => {
    const done = job(jobId, { result: { run_id: "run-base", content_digest: "digest-run-base",
                                        counts: baseResult.counts, coverage_complete: true, metrics: {} } });
    jobs.set(jobId, done);
    results.set(jobId, { job: done, result: baseResult });
  };
  const client: EligibilityLabClient = {
    session: async () => session,
    listBundles: async () => [bundle],
    getBundle: async () => bundle,
    listProposals: async () => proposals.map((p) => ({ ...p })),
    review: async (proposalId, decision) => {
      const target = proposals.find((p) => p.proposal_id === proposalId)!;
      target.review = { review_id: `rev-${proposalId}`, decision, reviewer: "local-operator", created_at: "now" };
      return target;
    },
    editProposal: async () => { throw new Error("not used"); },
    submitJob: async (request: JobRequest) => {
      const jobId = `job-${++counter}`;
      if (request.kind === "baseline") {
        addBaseline(jobId);
      } else if (request.kind === "scenario") {
        const done = job(jobId, { kind: "scenario", baseline_job_id: request.baseline_job_id,
                                  scenario: { scenario_id: request.scenario_id ?? null, edits: request.edits ?? null,
                                              title: null },
                                  result: { run_id: `run-${jobId}`, content_digest: `digest-${jobId}`,
                                            counts: { passing: 3, failing: 1, unresolved: 0, total: 4 },
                                            coverage_complete: true, metrics: {} } });
        jobs.set(jobId, done);
        results.set(jobId, { job: done, result: makeResult(`run-${jobId}`, ["P1", "P2", "P3"], ["P4"]) });
      }
      return jobs.get(jobId)!;
    },
    listJobs: async () => [...jobs.values()],
    getJob: async (jobId) => {
      const found = jobs.get(jobId);
      if (!found) throw new EligibilityLabError("job_not_found", "no job has that identity", 404);
      return found;
    },
    listItems: async () => [],
    cancelJob: async (jobId) => jobs.get(jobId)!,
    resumeJob: async (jobId) => jobs.get(jobId)!,
    retryItems: async (jobId) => jobs.get(jobId)!,
    getResult: async (jobId) => {
      const found = results.get(jobId);
      if (!found) throw new EligibilityLabError("result_not_ready", "no result", 409);
      return found;
    },
    getComparison: async (jobId) => comparisonFor(jobId, 3),
    ledger: async () => [],
    downloads: (jobId) => ({ report: `/v1/jobs/${jobId}/report.json`, matrix: `/v1/jobs/${jobId}/matrix.csv`,
                             comparison: `/v1/jobs/${jobId}/comparison.csv` }),
    ...overrides,
  };
  return { client, jobs, results, addBaseline, proposals };
}
