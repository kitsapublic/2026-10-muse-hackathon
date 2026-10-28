import {
  type BundleDetail,
  type EditSpec,
  type EligibilityLabClient,
  type Job,
  type Mode,
  type Proposal,
  TERMINAL_STATES,
} from "@kitsa/eligibility-lab-client";
import {
  CohortCounts,
  CohortSummaries,
  ComparisonView,
  CriterionReview,
  DecisionMatrix,
  ErrorNotice,
  ExecutionMetrics,
  ImpactTable,
  JobStatus,
  ModeBadge,
  ModeChooser,
  PatientWaterfall,
  reviewState,
  ScenarioControls,
  signed,
  STATE_LABELS,
} from "@kitsa/eligibility-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { newKey, useJob, useLoad, useUrlState } from "./hooks";

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
  const saved = detail?.scenarios.find((s) => s.scenario_id === scenario.scenario_id);
  return scenario.title ?? saved?.title ?? scenario.scenario_id ?? job.job_id;
}

export function App({ client }: { client: EligibilityLabClient }) {
  const [url, setUrl] = useUrlState();
  const session = useLoad(() => client.session(), [client]);
  const bundles = useLoad(() => client.listBundles(), [client]);
  const bundleKey = url.bundle ?? bundles.data?.[0]?.bundle_key ?? null;
  const detail = useLoad(() => (bundleKey ? client.getBundle(bundleKey) : null), [client, bundleKey]);
  const proposals = useLoad(() => (bundleKey ? client.listProposals(bundleKey) : null), [client, bundleKey]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const selection = { ...defaultSelection(detail.data, proposals.data ?? []), ...chosen };
  const [mode, setMode] = useState<Mode>("reference");
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
  const baselineResult = useLoad(
    () => (url.baseline && baseline.job?.result ? client.getResult(url.baseline) : null),
    [client, url.baseline, baseline.job?.result?.content_digest],
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
    () => (url.scenario && selectedScenario.job?.result ? client.getComparison(url.scenario) : null),
    [client, url.scenario, selectedScenario.job?.result?.content_digest],
  );
  const scenarioResult = useLoad(
    () => (url.scenario && selectedScenario.job?.result ? client.getResult(url.scenario) : null),
    [client, url.scenario, selectedScenario.job?.result?.content_digest],
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
  const current = baselineResult.data && baselineResult.data.job.job_id === url.baseline ? baselineResult.data : null;
  const compared = comparison.data && comparison.data.job.job_id === url.scenario ? comparison.data : null;
  const comparedResult =
    scenarioResult.data && scenarioResult.data.job.job_id === url.scenario ? scenarioResult.data.result : null;

  async function act(section: string, work: () => Promise<void>) {
    setActionError(null);
    try {
      await work();
    } catch (error) {
      setActionError({ section, error });
    }
  }

  async function review(proposal: Proposal, decision: "approved" | "rejected") {
    setBusy(proposal.proposal_id);
    await act("review", async () => {
      await client.review(proposal.proposal_id, decision);
      proposals.reload();
    });
    setBusy(null);
  }

  async function approveAll() {
    setBusy("all");
    await act("review", async () => {
      for (const proposal of selectedProposals) {
        if (reviewState(proposal) !== "approved" && proposal.valid) await client.review(proposal.proposal_id, "approved");
      }
      proposals.reload();
    });
    setBusy(null);
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
      setUrl({ interpretation: job.job_id });
    });
    setBusy(null);
    submitting.current = false;
  }

  async function runBaseline() {
    if (!bundleKey || submitting.current) return;
    submitting.current = true;
    await act("baseline", async () => {
      const live = mode === "live";
      const job = await client.submitJob(
        { kind: "baseline", bundle_key: bundleKey, mode, proposal_ids: selectedProposals.map((p) => p.proposal_id),
          confirm_spend: live && spendConfirmed, ...(live && liveExperiment ? { experiment_id: liveExperiment } : {}) },
        newKey("baseline"),
      );
      setUrl({ baseline: job.job_id, scenario: null });
    });
    submitting.current = false;
  }

  async function runScenario(edits: EditSpec[], savedScenarioId: string | null) {
    if (!url.baseline || submitting.current) return;
    submitting.current = true;
    await act("scenario", async () => {
      const job = await client.submitJob(
        savedScenarioId
          ? { kind: "scenario", baseline_job_id: url.baseline!, scenario_id: savedScenarioId }
          : { kind: "scenario", baseline_job_id: url.baseline!, edits },
        newKey("scenario"),
      );
      scenarios.reload();
      setUrl({ scenario: job.job_id });
    });
    submitting.current = false;
  }

  async function retryFailed(job: Job) {
    await act(job.kind === "interpretation" ? "interpretation" : "baseline", async () => {
      const items = await client.listItems(job.job_id);
      const retryable = items.filter((item) => item.state === "failed" || item.state === "ambiguous");
      await client.retryItems(job.job_id, retryable.map((item) => item.item_id));
      if (job.kind === "interpretation") interpretation.refresh();
      else baseline.refresh();
    });
  }

  async function control(job: Job, action: "cancel" | "resume") {
    await act(job.kind === "interpretation" ? "interpretation" : job.kind === "baseline" ? "baseline" : "scenario", async () => {
      await (action === "cancel" ? client.cancelJob(job.job_id) : client.resumeJob(job.job_id));
      if (job.job_id === url.interpretation) interpretation.refresh();
      if (job.job_id === url.baseline) baseline.refresh();
      if (job.job_id === url.scenario) selectedScenario.refresh();
      scenarios.reload();
    });
  }

  const errorFor = (section: string) => (actionError?.section === section ? <ErrorNotice error={actionError.error} /> : null);
  const loadingProblem = session.error ?? bundles.error ?? detail.error ?? proposals.error;
  const downloads = (jobId: string) => client.downloads(jobId);

  return (
    <div className="elab showcase">
      <a className="showcase__skip" href="#main">Skip to the workflow</a>
      <header className="showcase__bar">
        <p className="showcase__name">Eligibility Lab</p>
        {detail.data && (
          <dl className="showcase__identity">
            <div>
              <dt>Protocol</dt>
              <dd>{detail.data.protocol.protocol_id} version {detail.data.protocol.version}</dd>
            </div>
            <div>
              <dt>Cohort</dt>
              <dd>{detail.data.cohort.patients} synthetic patients</dd>
            </div>
            <div>
              <dt>Answers</dt>
              <dd><ModeBadge mode={baseline.job?.mode ?? mode} /></dd>
            </div>
          </dl>
        )}
      </header>
      <main id="main" className="showcase__main">
        <h1 className="showcase__title">Simulate who qualifies, and what a change would do</h1>
        <p className="showcase__lede">
          Apply a protocol’s eligibility criteria to a synthetic cohort, see which patients meet them, fail them or
          stay unresolved, and test the thresholds the protocol permits you to change. Every count comes from the
          Eligibility Lab engine running on this machine.
        </p>
        {loadingProblem ? <ErrorNotice error={loadingProblem} /> : null}
        {(session.loading || detail.loading) && !detail.data ? <p role="status">Loading the protocol…</p> : null}

        <section className="showcase__section" aria-labelledby="step-protocol">
          <h2 id="step-protocol"><span className="showcase__step">1</span> Protocol and cohort</h2>
          {(bundles.data?.length ?? 0) > 1 && (
            <label className="showcase__select">
              Installed protocol and cohort{" "}
              <select value={bundleKey ?? ""} onChange={(e) => {
                setChosen({});
                setInterpretSpend(false);
                setUrl({ bundle: e.currentTarget.value, baseline: null, scenario: null, interpretation: null });
              }}>
                {bundles.data?.map((b) => <option key={b.bundle_key} value={b.bundle_key}>{b.bundle_key}</option>)}
              </select>
            </label>
          )}
          {detail.data && (
            <>
              <p className="showcase__protocol">{detail.data.protocol.title}</p>
              <dl className="showcase__facts">
                <div><dt>Installed bundle</dt><dd>{detail.data.bundle_key}</dd></div>
                <div><dt>Cohort</dt><dd>{detail.data.cohort.cohort_id}, {detail.data.cohort.patients} patients</dd></div>
                <div><dt>Evaluation date</dt><dd>{detail.data.identities.reference_date}</dd></div>
                <div><dt>Narrative answers</dt><dd>{detail.data.narrative_source.description}</dd></div>
              </dl>
              <details className="showcase__conventions">
                <summary>Assessment conventions from the protocol</summary>
                {conventions.map((p) => (
                  <p key={p.anchor}><span className="elab-muted">{p.anchor}</span> {p.text}</p>
                ))}
              </details>
            </>
          )}
        </section>

        <section className="showcase__section" aria-labelledby="step-review">
          <h2 id="step-review"><span className="showcase__step">2</span> Review the interpretations</h2>
          <p className="showcase__lede">
            Each criterion keeps its protocol text. Its executable interpretation runs only after you approve it.
          </p>
          <details className="showcase__conventions">
            <summary>Interpret criteria with Muse</summary>
            <p>Request model proposals for these {criteria.length} criteria, then inspect and select them below.
              Each proposal still needs your approval. Existing selections stay in place.</p>
            {session.data?.modes.live.available && liveExperiment ? (
              <label className="showcase__confirm">
                <input type="checkbox" checked={interpretSpend}
                       onChange={(e) => setInterpretSpend(e.currentTarget.checked)} />{" "}
                Allow criterion interpretation requests from experiment {liveExperiment}, within its ceiling
              </label>
            ) : <p>{session.data?.modes.live.reason ?? "Live model interpretation is unavailable."}</p>}
            <button type="button" className="elab-button" onClick={interpretCriteria}
                    disabled={!session.data?.modes.live.available || !interpretSpend || !criteria.length ||
                              busy !== null || Boolean(interpretationRunning)}>
              Request model interpretations
            </button>
            {errorFor("interpretation")}
            {interpretation.error ? <ErrorNotice error={interpretation.error} /> : null}
            {interpretation.job && (
              <JobStatus job={interpretation.job} title="Criterion interpretation"
                         onCancel={() => control(interpretation.job!, "cancel")}
                         onResume={() => control(interpretation.job!, "resume")}
                         resumeDisabled={!interpretSpend} />
            )}
            {interpretation.job && TERMINAL_STATES.includes(interpretation.job.state) &&
              interpretation.job.progress.failed + interpretation.job.progress.ambiguous > 0 && (
              <button type="button" className="elab-button elab-button--quiet" disabled={!interpretSpend}
                      onClick={() => retryFailed(interpretation.job!)}>
                Retry failed or ambiguous interpretations
              </button>
            )}
          </details>
          <div className="showcase__row">
            <p role="status">{approved} of {criteria.length} interpretations approved</p>
            <button type="button" className="elab-button" onClick={approveAll}
                    disabled={busy !== null || allApproved || !criteria.length}>
              Approve all shown
            </button>
          </div>
          {errorFor("review")}
          <CriterionReview criteria={criteria} proposals={proposals.data ?? []} questions={questions}
                           selection={selection} busy={busy}
                           onSelect={(criterion, proposal) => setChosen({ ...chosen, [criterion]: proposal })}
                           onReview={review} />
        </section>

        <section className="showcase__section" aria-labelledby="step-baseline">
          <h2 id="step-baseline"><span className="showcase__step">3</span> Run the baseline</h2>
          {session.data && (
            <ModeChooser modes={session.data.modes} value={mode}
                         onChange={(next) => { setMode(next); setSpendConfirmed(false); }} />
          )}
          {mode === "live" && liveExperiment && (
            <label className="showcase__confirm">
              <input type="checkbox" checked={spendConfirmed} onChange={(e) => setSpendConfirmed(e.currentTarget.checked)} />{" "}
              Allow model requests that spend from experiment {liveExperiment}, within its ceiling
            </label>
          )}
          <div className="showcase__row">
            <button type="button" className="elab-button" onClick={runBaseline}
                    disabled={!allApproved || (mode === "live" && !spendConfirmed)}>
              Run baseline
            </button>
            {!allApproved && <span className="elab-muted">Approve every interpretation first.</span>}
          </div>
          {errorFor("baseline")}
          {baseline.error ? <ErrorNotice error={baseline.error} /> : null}
          {baseline.job && (
            <JobStatus job={baseline.job} title="Baseline" onCancel={() => control(baseline.job!, "cancel")}
                       onResume={() => control(baseline.job!, "resume")}
                       resumeDisabled={baseline.job.mode === "live" && !spendConfirmed} />
          )}
          {baseline.job?.mode === "live" && TERMINAL_STATES.includes(baseline.job.state) &&
            baseline.job.progress.failed + baseline.job.progress.ambiguous > 0 && (
            <div className="showcase__row">
              <button type="button" className="elab-button elab-button--quiet" disabled={!spendConfirmed}
                      onClick={() => retryFailed(baseline.job!)}>
                Retry {baseline.job.progress.failed + baseline.job.progress.ambiguous} failed or ambiguous requests
              </button>
              <span className="elab-muted">
                Each retry is a new, separately reserved request; an ambiguous one may already have been billed.
              </span>
            </div>
          )}
          {current && (
            <div className="showcase__results">
              <CohortCounts counts={current.result.counts} caption="Baseline patients by classification" />
              <h3>Patient waterfall</h3>
              <PatientWaterfall result={current.result} criteria={anchors} />
              <h3>Criterion impact</h3>
              <ImpactTable result={current.result} />
              <h3>Cohort summary</h3>
              <CohortSummaries result={current.result} />
              <h3>Every decision</h3>
              <DecisionMatrix result={current.result} />
              <h3>Execution</h3>
              <ExecutionMetrics result={current.result} job={current.job} />
            </div>
          )}
        </section>

        <section className="showcase__section" aria-labelledby="step-scenarios">
          <h2 id="step-scenarios"><span className="showcase__step">4</span> Try a scenario</h2>
          {current && detail.data ? (
            <>
              <p className="showcase__lede">
                Only the thresholds the protocol marks adjustable can change. Each scenario reruns the engine against
                the same baseline, cohort and evaluation date.
              </p>
              <ScenarioControls parameters={detail.data.scenario_parameters} presets={detail.data.scenarios}
                                labels={PARAMETER_LABELS} onRun={runScenario} />
              {errorFor("scenario")}
              {scenarioJobs.length > 0 && (
                <table className="elab-table showcase__runs">
                  <caption>Scenario runs on this baseline</caption>
                  <thead>
                    <tr>
                      <th scope="col">Scenario</th>
                      <th scope="col">State</th>
                      <th scope="col">Meet every criterion</th>
                      <th scope="col">Change</th>
                      <th scope="col"><span className="showcase__hidden">Action</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarioJobs.map((job) => (
                      <tr key={job.job_id} aria-current={job.job_id === url.scenario ? "true" : undefined}>
                        <th scope="row">{scenarioTitle(job, detail.data)}</th>
                        <td>{STATE_LABELS[job.state]}</td>
                        <td>{job.result?.counts.passing ?? ""}</td>
                        <td>{job.result && current ? signed(job.result.counts.passing - current.result.counts.passing) : ""}</td>
                        <td>
                          <button type="button" className="elab-button elab-button--quiet"
                                  disabled={!TERMINAL_STATES.includes(job.state)}
                                  onClick={() => setUrl({ scenario: job.job_id })}>
                            Compare<span className="showcase__hidden"> {scenarioTitle(job, detail.data)}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <p className="elab-muted">Run the baseline to compare scenarios against it.</p>
          )}
        </section>

        <section className="showcase__section" aria-labelledby="step-compare">
          <h2 id="step-compare"><span className="showcase__step">5</span> Compare with the baseline</h2>
          {selectedScenario.job && (
            <JobStatus job={selectedScenario.job} title={scenarioTitle(selectedScenario.job, detail.data)}
                       onCancel={() => control(selectedScenario.job!, "cancel")}
                       onResume={() => control(selectedScenario.job!, "resume")} />
          )}
          {comparison.error ? <ErrorNotice error={comparison.error} /> : null}
          {compared ? (
            <ComparisonView comparison={compared.comparison} baseline={current?.result ?? null}
                            scenario={comparedResult} />
          ) : (
            <p className="elab-muted">Choose a finished scenario run to compare it with its baseline.</p>
          )}
        </section>

        <section className="showcase__section" aria-labelledby="step-export">
          <h2 id="step-export"><span className="showcase__step">6</span> Export</h2>
          {current ? (
            <ul className="showcase__downloads">
              <li><a href={downloads(current.job.job_id).report} download>Baseline report (JSON)</a></li>
              <li><a href={downloads(current.job.job_id).matrix} download>Baseline decision matrix (CSV)</a></li>
              {compared && (
                <>
                  <li><a href={downloads(compared.job.job_id).report} download>Scenario report (JSON)</a></li>
                  <li><a href={downloads(compared.job.job_id).matrix} download>Scenario decision matrix (CSV)</a></li>
                  <li><a href={downloads(compared.job.job_id).comparison} download>Changed patients (CSV)</a></li>
                </>
              )}
            </ul>
          ) : (
            <p className="elab-muted">Exports appear once the baseline has a result.</p>
          )}
        </section>
      </main>
    </div>
  );
}
