import { TERMINAL_STATES } from "@kitsa/eligibility-lab-client";
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
import type { Workflow } from "./useWorkflow";


const PARAMETER_LABELS: Record<string, string> = { "I1.age_max": "Upper age limit, in years", "I7.max_regimens": "Most prior systemic regimens allowed" };
export function Explore({ flow }: { flow: Workflow }) {
  const { url, setUrl, session, bundles, bundleKey, detail, proposals, chosen, selection, mode, setMode, spendConfirmed, setSpendConfirmed, interpretSpend, setInterpretSpend, liveExperiment, busy, interpretation, interpretationRunning, baseline, selectedScenario, current, compared, comparedResult, comparison, scenarioJobs, anchors, conventions, criteria, questions, approved, allApproved, loadingProblem, errorFor, downloads, review, approveAll, interpretCriteria, runBaseline, runScenario, retryFailed, control, setChosen, scenarioTitle } = flow;
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
        <h1 className="showcase__title">Review eligibility decisions and compare protocol changes.</h1>
        <p className="showcase__lede">
          This view shows the full protocol review and screening workflow. You can inspect individual decisions and compare changes to the permitted thresholds. The Eligibility Lab engine calculates each result on this machine.
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
            Review each interpretation alongside its original protocol text before approving it for execution.
          </p>
          <details className="showcase__conventions">
            <summary>Interpret criteria with Muse</summary>
            <p>Request model proposals for these {criteria.length} criteria, then inspect and select them below.
              New proposals require your approval and leave the current selections in place.</p>
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
                    disabled={busy !== null || !session.data?.modes[mode].available || !allApproved || (mode === "live" && !spendConfirmed)}>
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
              <ScenarioControls key={url.baseline} parameters={detail.data.scenario_parameters} presets={detail.data.scenarios}
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
