import {
  type BundleDetail,
  type EditSpec,
  type EligibilityLabClient,
  type Job,
  type Mode,
  type Proposal,
  TERMINAL_STATES,
} from "@kitsa/eligibility-lab-client";
import { ErrorNotice, reviewState } from "@kitsa/eligibility-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { newKey, useJob, useLoad, useUrlState } from "./hooks";
import { isStoryBundle, scenarioNames } from "./story";

/** Readable names for the reference case's two permitted scenario parameters. */
const PARAMETER_LABELS: Record<string, string> = {
  "I1.age_max": "Upper age limit, in years",
  "I7.max_regimens": "Most prior systemic regimens allowed",
};

function defaultSelection(detail: BundleDetail | null, proposals: readonly Proposal[]): Record<string, string> {
  const selection: Record<string, string> = {};
  for (const criterion of detail?.criteria ?? []) {
    const options = proposals.filter((p) => p.criterion_id === criterion.criterion_id);
    const chosen = [...options].reverse().find((p) => reviewState(p) === "approved") ??
      options.find((p) => p.origin === "reference") ?? options[0];
    if (chosen) selection[criterion.criterion_id] = chosen.proposal_id;
  }
  return selection;
}

function scenarioTitle(job: Job, detail: BundleDetail | null): string {
  const scenario = job.scenario;
  if (!scenario) return job.job_id;
  if (scenario.edits?.length) {
    return scenario.edits
      .map((e) => `${PARAMETER_LABELS[`${e.criterion_id}.${e.parameter}`] ?? `${e.criterion_id}.${e.parameter}`} ${e.value}`)
      .join(", ");
  }
  if (isStoryBundle(detail) && scenario.scenario_id && scenarioNames[scenario.scenario_id]) return scenarioNames[scenario.scenario_id]!;
  const saved = detail?.scenarios.find((s) => s.scenario_id === scenario.scenario_id);
  return scenario.title ?? saved?.title ?? scenario.scenario_id ?? job.job_id;
}

export function useWorkflow(client: EligibilityLabClient) {
  const [url, setUrl] = useUrlState();
  const session = useLoad(() => client.session(), [client]);
  const bundles = useLoad(() => client.listBundles(), [client]);
  const bundleKey = url.bundle ?? bundles.data?.[0]?.bundle_key ?? null;
  const detail = useLoad(() => (bundleKey ? client.getBundle(bundleKey) : null), [client, bundleKey]);
  const proposals = useLoad(() => (bundleKey ? client.listProposals(bundleKey) : null), [client, bundleKey]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const selection = { ...defaultSelection(detail.data, proposals.data ?? []), ...chosen };
  const requestedMode = url.mode === "reference" || url.mode === "recorded" || url.mode === "live" ? url.mode : null;
  const setMode = (next: Mode) => { setSpendConfirmed(false); setUrl({ mode: next }); };
  const [spendConfirmed, setSpendConfirmed] = useState(false);
  const [interpretSpend, setInterpretSpend] = useState(false);
  const liveExperiment = session.data?.modes.live.experiment_id ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ section: string; error: unknown } | null>(null);
  const submitting = useRef(false);

  const interpretation = useJob(client, url.interpretation);
  const interpretationRunning = interpretation.job && !TERMINAL_STATES.includes(interpretation.job.state);
  const reloadProposals = proposals.reload;
  useEffect(() => {
    if (interpretation.job && TERMINAL_STATES.includes(interpretation.job.state)) reloadProposals();
  }, [interpretation.job?.job_id, interpretation.job?.state, reloadProposals]);
  const baseline = useJob(client, url.baseline);
  const mode: Mode = requestedMode ?? baseline.job?.mode ?? (session.data?.modes.recorded.available ? "recorded" : "reference");
  const context = useRef({ bundleKey, baseline: url.baseline });
  context.current = { bundleKey, baseline: url.baseline };
  useEffect(() => { setChosen({}); setSpendConfirmed(false); setInterpretSpend(false); }, [bundleKey, liveExperiment]);
  const baselineResult = useLoad(
    (signal) => (url.baseline && baseline.job?.bundle_key === bundleKey && baseline.job.kind === "baseline" && baseline.job?.result ? client.getResult(url.baseline, signal) : null),
    [client, url.baseline, bundleKey, baseline.job?.bundle_key, baseline.job?.result?.content_digest],
  );
  const scenarios = useLoad(
    () => (bundleKey && url.baseline ? client.listJobs(bundleKey) : null),
    [client, bundleKey, url.baseline, baseline.job?.state],
  );
  const scenarioJobs = (scenarios.data ?? []).filter((j) => j.kind === "scenario" && j.baseline_job_id === url.baseline);
  const scenariosRunning = scenarioJobs.some((j) => !TERMINAL_STATES.includes(j.state));
  const reloadScenarios = scenarios.reload;
  useEffect(() => {
    if (!scenariosRunning) return;
    const timer = setTimeout(reloadScenarios, 500);
    return () => clearTimeout(timer);
  }, [scenariosRunning, scenarios.data, reloadScenarios]);
  const selectedScenario = useJob(client, url.scenario);
  const comparison = useLoad(
    (signal) => (url.scenario && selectedScenario.job?.baseline_job_id === url.baseline && selectedScenario.job?.bundle_key === bundleKey && selectedScenario.job?.result ? client.getComparison(url.scenario, signal) : null),
    [client, url.scenario, url.baseline, bundleKey, selectedScenario.job?.baseline_job_id, selectedScenario.job?.result?.content_digest],
  );
  const scenarioResult = useLoad(
    (signal) => (url.scenario && selectedScenario.job?.baseline_job_id === url.baseline && selectedScenario.job?.bundle_key === bundleKey && selectedScenario.job?.result ? client.getResult(url.scenario, signal) : null),
    [client, url.scenario, url.baseline, bundleKey, selectedScenario.job?.baseline_job_id, selectedScenario.job?.result?.content_digest],
  );

  const questions = useMemo(
    () => Object.fromEntries((detail.data?.questions ?? []).map((q) => [q.question_id, q.statement])),
    [detail.data],
  );
  const criteria = detail.data?.criteria ?? [];
  const selectedProposals = criteria
    .map((c) => (proposals.data ?? []).find((p) => p.proposal_id === selection[c.criterion_id]))
    .filter((p): p is Proposal => p !== undefined);
  const approved = selectedProposals.filter((p) => reviewState(p) === "approved").length;
  const allApproved = criteria.length > 0 && approved === criteria.length;
  const anchors = Object.fromEntries(criteria.map((c) => [c.criterion_id, { anchor: c.anchor, category: c.category }]));
  const conventions = (detail.data?.protocol.passages ?? []).filter(
    (p) => p.anchor !== "title" && !criteria.some((c) => c.anchor === p.anchor),
  );
  const current = baselineResult.data && baselineResult.data.job.job_id === url.baseline && baselineResult.data.job.bundle_key === bundleKey ? baselineResult.data : null;
  const compared = comparison.data && comparison.data.job.job_id === url.scenario && comparison.data.baseline_job_id === url.baseline && current ? comparison.data : null;
  const comparedResult =
    scenarioResult.data && scenarioResult.data.job.job_id === url.scenario && scenarioResult.data.job.baseline_job_id === url.baseline && current ? scenarioResult.data.result : null;

  async function act(section: string, work: () => Promise<void>) {
    const started = { ...context.current };
    setActionError(null);
    try {
      await work();
    } catch (error) {
      if (context.current.bundleKey === started.bundleKey && context.current.baseline === started.baseline) setActionError({ section, error });
    }
  }

  async function review(proposal: Proposal, decision: "approved" | "rejected") {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(proposal.proposal_id);
    await act("review", async () => {
      await client.review(proposal.proposal_id, decision);
      proposals.reload();
    });
    setBusy(null);
    submitting.current = false;
  }

  async function approveAll() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy("all");
    await act("review", async () => {
      for (const proposal of selectedProposals) {
        if (reviewState(proposal) !== "approved" && proposal.valid) await client.review(proposal.proposal_id, "approved");
      }
      proposals.reload();
    });
    setBusy(null);
    submitting.current = false;
  }

  async function interpretCriteria() {
    if (!bundleKey || !liveExperiment || !interpretSpend || submitting.current) return;
    submitting.current = true;
    setBusy("interpret");
    await act("interpretation", async () => {
      const job = await client.submitJob(
        { kind: "interpretation", bundle_key: bundleKey, criterion_ids: criteria.map((c) => c.criterion_id),
          experiment_id: liveExperiment, confirm_spend: true, retry: false },
        newKey("interpretation"),
      );
      if (context.current.bundleKey === bundleKey) setUrl({ interpretation: job.job_id });
    });
    setBusy(null);
    submitting.current = false;
  }

  async function runBaseline() {
    if (!bundleKey || !allApproved || !session.data?.modes[mode].available || (mode === "live" && (!spendConfirmed || !liveExperiment)) || submitting.current) return;
    submitting.current = true;
    setBusy("baseline");
    await act("baseline", async () => {
      const live = mode === "live";
      const job = await client.submitJob(
        { kind: "baseline", bundle_key: bundleKey, mode, proposal_ids: selectedProposals.map((p) => p.proposal_id),
          confirm_spend: live && spendConfirmed, ...(live && liveExperiment ? { experiment_id: liveExperiment } : {}) },
        newKey("baseline"),
      );
      if (context.current.bundleKey === bundleKey && context.current.baseline === url.baseline) setUrl({ bundle: bundleKey, baseline: job.job_id, scenario: null, scene: "baseline", patient: null });
    });
    setBusy(null);
    submitting.current = false;
  }

  async function runScenario(edits: EditSpec[], savedScenarioId: string | null) {
    if (!url.baseline || !current || submitting.current) return;
    submitting.current = true;
    setBusy("scenario");
    await act("scenario", async () => {
      const job = await client.submitJob(
        savedScenarioId
          ? { kind: "scenario", baseline_job_id: url.baseline!, scenario_id: savedScenarioId }
          : { kind: "scenario", baseline_job_id: url.baseline!, edits },
        newKey("scenario"),
      );
      scenarios.reload();
      if (context.current.bundleKey === bundleKey && context.current.baseline === url.baseline) setUrl({ scenario: job.job_id });
    });
    setBusy(null);
    submitting.current = false;
  }

  async function retryFailed(job: Job) {
    if (submitting.current || (job.mode === "live" && !(job.kind === "interpretation" ? interpretSpend : spendConfirmed))) return;
    submitting.current = true; setBusy("retry");
    await act(job.kind === "interpretation" ? "interpretation" : "baseline", async () => {
      const items = await client.listItems(job.job_id);
      const retryable = items.filter((item) => item.state === "failed" || item.state === "ambiguous");
      await client.retryItems(job.job_id, retryable.map((item) => item.item_id));
      if (job.kind === "interpretation") interpretation.refresh();
      else baseline.refresh();
    });
    submitting.current = false; setBusy(null);
  }

  async function control(job: Job, action: "cancel" | "resume") {
    if (submitting.current || (action === "resume" && job.mode === "live" && job.kind !== "scenario" && !(job.kind === "interpretation" ? interpretSpend : spendConfirmed))) return;
    submitting.current = true; setBusy(action);
    await act(job.kind === "interpretation" ? "interpretation" : job.kind === "baseline" ? "baseline" : "scenario", async () => {
      await (action === "cancel" ? client.cancelJob(job.job_id) : client.resumeJob(job.job_id));
      if (job.job_id === url.interpretation) interpretation.refresh();
      if (job.job_id === url.baseline) baseline.refresh();
      if (job.job_id === url.scenario) selectedScenario.refresh();
      scenarios.reload();
    });
    submitting.current = false; setBusy(null);
  }

  const errorFor = (section: string) => (actionError?.section === section ? <ErrorNotice error={actionError.error} /> : null);
  const loadingProblem = session.error ?? bundles.error ?? detail.error ?? proposals.error ?? baselineResult.error ?? scenarioResult.error;
  const downloads = (jobId: string) => client.downloads(jobId);

  return { url, setUrl, session, bundles, bundleKey, detail, proposals, chosen, selection, mode, setMode, spendConfirmed, setSpendConfirmed, interpretSpend, setInterpretSpend, liveExperiment, busy, interpretation, interpretationRunning, baseline, selectedScenario, current, compared, comparedResult, comparison, scenarioJobs, anchors, conventions, criteria, questions, approved, allApproved, loadingProblem, errorFor, downloads, review, approveAll, interpretCriteria, runBaseline, runScenario, retryFailed, control, setChosen, scenarioTitle };
}
export type Workflow = ReturnType<typeof useWorkflow>;
