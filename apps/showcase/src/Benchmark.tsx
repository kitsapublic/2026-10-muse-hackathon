import { useState } from "react";
import { comparison, count, history, money } from "./story";

export function Benchmark({ compact = false }: { compact?: boolean }) {
  const demo = history.demonstration, evaluation = history.private_evaluation_aggregates;
  const ops = demo.operations;
  return <div className="benchmark">
    <div className="section-heading"><div><p className="eyebrow">Historical measurement · 28 October 2026</p><h3>The original run shows Muse’s measured performance.</h3></div><span className="story-status">Muse Spark 1.3</span></div>
    <p>The original live run screened 100 synthetic patients using Muse Spark 1.3 with minimal reasoning and reviewed reference rules. The figures below come from that run.</p>
    <dl className="metric-grid">
      <div><dt>Model requests</dt><dd>{ops.requests}</dd></div><div><dt>Whole-job elapsed</dt><dd>{(ops.elapsed_ms / 1000).toFixed(1)} <small>s</small></dd></div>
      <div><dt>Median / p95 request</dt><dd>{(ops.latency_ms.median / 1000).toFixed(2)} / {(ops.latency_ms.p95 / 1000).toFixed(2)} <small>s</small></dd></div>
      <div><dt>Calculated charges</dt><dd>{money(ops.charged_microusd)}</dd></div>
    </dl>
    <p className="elab-muted">The run used {count(ops.tokens.prompt_tokens)} input tokens and {count(ops.tokens.completion_tokens)} completion tokens. Completion tokens include {count(ops.tokens.reasoning_tokens)} reasoning tokens. The charge is calculated from token usage and has not been reconciled with an invoice.</p>
    <details open={compact ? undefined : true}><summary>Inspect model quality and comparison evidence</summary>
    <h4>Agreement depends on what is being compared.</h4>
    <div className="story-table-scroll"><table className="elab-table"><caption>Agreement with independently stored expectations, under reviewed reference rules</caption>
      <thead><tr><th>Agreement</th><th>Demonstration · 100 patients</th><th>Private evaluation · 40 patients</th></tr></thead>
      <tbody><tr><th>Narrative answers</th><td>{demo.narrative.answers.agree} / {demo.narrative.inputs}</td><td>{evaluation.narrative.answers.agree} / {evaluation.narrative.inputs}</td></tr>
        <tr><th>Criterion decisions</th><td>{demo.criterion_decisions.agree} / {demo.criterion_decisions.cells}</td><td>{evaluation.criterion_decisions.agree} / {evaluation.criterion_decisions.cells}</td></tr>
        <tr><th>Patient classifications</th><td>100 / 100</td><td>38 / 40</td></tr>
        <tr><th>False eligibility</th><td>{demo.patient_classification.false_eligibility.count} / 100</td><td>{evaluation.patient_classification.false_eligibility.count} / 40</td></tr>
      </tbody></table></div>
    <p className="elab-muted">Evaluation figures include one explicit recovery after an invalid citation (159 / 160 valid responses on the first pass). Narrative disagreements can leave final classifications unchanged. Evaluation records remain private.</p>
    <details><summary>Matched model comparison</summary>
      <p>The planned comparison gives each model the same questions and notes, then applies the same eligibility rules. It uses three repetitions with four concurrent requests and a 4,096-token output cap. Each provider’s low or minimal reasoning setting has different semantics, so these settings do not establish equal compute budgets.</p>
      <MatchedComparison />
      <p>The historical Muse results were collected under a different configuration. A fair model ranking will require the planned comparison to run. Other models can also use bounded questions and evidence citations within this architecture.</p>
    </details>
    <p className="evidence-limit">These results cover one invented protocol and synthetic cohorts. The evaluation uses different wording and case families but shares evidence patterns with the demonstration, so further work is needed to establish performance on other protocols or real clinical data.</p>
    </details>
  </div>;
}


type MatchedMetrics = {
  repetitions: number;
  narrative: { agree: number; denominator: number; abstentions: number };
  answers: { citation_failures: number; technical_failures: number; contract_failures: number; not_sent: number; denominator: number };
  criteria: { agree: number; cells: number };
  patients: { agree: number; denominator: number; false_eligibility: number; missed_eligibility: number };
  operations: { requests: number; calculated_usd: string; unreconciled_charges: number; input_tokens: number; output_tokens: number;
    median_latency_ms_by_repetition: (number | null)[]; p95_latency_ms_by_repetition: (number | null)[];
    answers_per_minute_by_repetition: (string | null)[]; elapsed_ms_by_repetition: (number | null)[] };
};
type MatchedModel = { model: string; status: string; unavailable_reason: string | null; reasoning: string;
  splits: Record<"demonstration" | "evaluation", { first_pass: MatchedMetrics | null; with_recovery: MatchedMetrics | null }> };
function MatchedComparison() {
  const [split, setSplit] = useState<"demonstration" | "evaluation">("demonstration");
  const [recovery, setRecovery] = useState(false);
  const models: MatchedModel[] = comparison.models;
  const measured = models.some(m => m.status === "measured");
  const timings = (values: (number | null)[]) => values.map(v => v === null ? "unknown" : (v / 1000).toFixed(2) + "s").join(" / ");
  return <>
    {measured && <div className="showcase__row"><label>Cohort <select value={split} onChange={e => setSplit(e.currentTarget.value as typeof split)}><option value="demonstration">Demonstration · 100 patients</option><option value="evaluation">Private evaluation · 40 patients</option></select></label><label><input type="checkbox" checked={recovery} onChange={e => setRecovery(e.currentTarget.checked)} /> Include explicit recovery</label></div>}
    <div className="comparison-models">{models.map(model => {
      const view = model.splits[split], metrics = recovery ? view.with_recovery ?? view.first_pass : view.first_pass;
      return <article key={model.model}><h4>{model.model}</h4><span className="story-status">{model.status === "measured" ? "Measured" : "Unavailable"}</span>
        {model.status !== "measured" || !metrics ? <p>{model.unavailable_reason ?? "No results available for this cohort."}</p> : <>
          <p>These {split} results cover {metrics.repetitions} repetitions and show {recovery && view.with_recovery ? "the outcome after explicit recovery" : "the first pass"}.</p>
          <dl className="comparison-scores">
            <div><dt>Narrative agreement</dt><dd>{metrics.narrative.agree} / {metrics.narrative.denominator}</dd></div>
            <div><dt>Abstentions</dt><dd>{metrics.narrative.abstentions} / {metrics.narrative.denominator}</dd></div>
            <div><dt>Criterion agreement</dt><dd>{metrics.criteria.agree} / {metrics.criteria.cells}</dd></div>
            <div><dt>Patient agreement</dt><dd>{metrics.patients.agree} / {metrics.patients.denominator}</dd></div>
            <div><dt>False eligibility</dt><dd>{metrics.patients.false_eligibility} / {metrics.patients.denominator}</dd></div>
            <div><dt>Missed eligibility</dt><dd>{metrics.patients.missed_eligibility} / {metrics.patients.denominator}</dd></div>
            <div><dt>Invalid citations / technical failures</dt><dd>{metrics.answers.citation_failures} / {metrics.answers.technical_failures} of {metrics.answers.denominator}</dd></div>
            <div><dt>Invalid structure / not sent</dt><dd>{metrics.answers.contract_failures} / {metrics.answers.not_sent} of {metrics.answers.denominator}</dd></div>
            <div><dt>Requests · calculated charges</dt><dd>{metrics.operations.requests} · ${metrics.operations.calculated_usd}</dd></div>
            <div><dt>Median latency, each repetition</dt><dd>{timings(metrics.operations.median_latency_ms_by_repetition)}</dd></div>
            <div><dt>p95 latency, each repetition</dt><dd>{timings(metrics.operations.p95_latency_ms_by_repetition)}</dd></div>
            <div><dt>Elapsed, each repetition</dt><dd>{timings(metrics.operations.elapsed_ms_by_repetition)}</dd></div>
            <div><dt>Answers / minute, each repetition</dt><dd>{metrics.operations.answers_per_minute_by_repetition.map(v => v ?? "unknown").join(" / ")}</dd></div>
            <div><dt>Input / completion tokens</dt><dd>{count(metrics.operations.input_tokens)} / {count(metrics.operations.output_tokens)}</dd></div>
          </dl><p>There are {metrics.operations.unreconciled_charges} unreconciled charges. Failed requests remain in the denominators, and recovery costs include the original attempts.</p>
        </>}
        <details><summary>Provider configuration</summary><p>{model.reasoning}</p></details>
      </article>;
    })}</div>
  </>;
}
