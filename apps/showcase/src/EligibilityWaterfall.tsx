import type { Result } from "@kitsa/eligibility-lab-client";
import { criterionName, criterionStatement } from "./clinical-copy";

function threshold(criterion: Result["criteria"][number]): string | null {
  const p = criterion.parameters;
  if (p.age_max !== undefined) return `${p.age_min ?? 18}–${p.age_max} years`;
  if (p.ecog_max !== undefined) return `ECOG 0–${p.ecog_max} · within 28 days`;
  if (p.anc_min !== undefined) return `≥ ${p.anc_min} × 10⁹/L · within 14 days`;
  if (p.hb_min !== undefined) return `≥ ${p.hb_min} g/dL · within 14 days`;
  if (p.max_regimens !== undefined) return `≤ ${p.max_regimens} prior systemic regimens`;
  if (p.washout_days !== undefined) return `≥ ${p.washout_days} days since last dose`;
  return null;
}

/** All cumulative counts and new exclusions come directly from the evaluator's waterfall. */
export function EligibilityWaterfall({ result }: { result: Result }) {
  const denominator = result.waterfall.denominator;
  const width = (count: number) => `${denominator ? count * 100 / denominator : 0}%`;
  return <section className="criterion-impact" aria-labelledby="eligibility-waterfall-title">
    <h2 id="eligibility-waterfall-title">Which eligibility criteria exclude patients?</h2>
    <figure className="eligibility-waterfall" aria-label="Cumulative eligibility waterfall">
      <figcaption><strong>{denominator} patients → {result.counts.passing} eligible</strong><p>Apply the criteria in protocol order. Each blue bar shows how many patients meet every criterion checked so far.</p></figcaption>
      <div className="waterfall-column-headings" aria-hidden="true"><span>Criterion applied</span><span>Meet all criteria so far</span><span>Newly excluded</span><span>Unresolved so far</span></div>
      <div className="waterfall-row waterfall-start"><div className="waterfall-label"><strong>Starting population</strong></div><div className="waterfall-measure"><div className="waterfall-track" aria-hidden="true"><span className="waterfall-fill" style={{width:width(denominator)}} /></div><strong>{denominator}</strong></div><span className="waterfall-neutral">—</span><span className="waterfall-neutral">—</span></div>
      <ol className="waterfall-steps">{result.waterfall.steps.map((step, index) => {
        const criterion = result.criteria.find(c => c.criterion_id === step.criterion_id);
        const name = criterion ? criterionName(criterion) : step.criterion_id;
        const limit = criterion ? threshold(criterion) : null;
        return <li className="waterfall-row" key={step.criterion_id} aria-label={`${name}: ${step.passing} meet all criteria so far; ${step.newly_failing} newly excluded; ${step.unresolved} unresolved so far`}>
          <div className="waterfall-label" title={criterion ? criterionStatement(criterion) : name}><span className="waterfall-order">{String(index + 1).padStart(2,"0")}</span><div><strong>{name}</strong>{limit && <small>{limit}</small>}</div></div>
          <div className="waterfall-measure"><div className="waterfall-track" aria-hidden="true"><span className="waterfall-fill" style={{width:width(step.passing)}} /></div><strong>{step.passing}</strong></div>
          <span className={step.newly_failing ? "waterfall-excluded" : "waterfall-neutral"}>{step.newly_failing ? `−${step.newly_failing}` : "0"}<small>newly excluded</small></span>
          <span className={step.unresolved ? "waterfall-unresolved" : "waterfall-neutral"}>{step.unresolved}<small>unresolved</small></span>
        </li>;
      })}</ol>
      <div className="waterfall-outcome"><strong>{result.counts.passing} eligible</strong><span>{result.counts.failing} excluded</span><span>{result.counts.unresolved} unresolved</span></div>
      <p className="waterfall-note">A patient exits the blue population when a criterion fails or remains unresolved. Red counts new exclusions at each step; amber counts unresolved patients still awaiting an eligibility decision. Exclusions are counted once, at the first failing criterion.</p>
    </figure>
  </section>;
}

export function EligibilityWaterfallComparison({ baseline, scenario, scenarioTitle }: { baseline: Result; scenario: Result; scenarioTitle: string }) {
  const scale = Math.max(baseline.waterfall.denominator, scenario.waterfall.denominator);
  const scenarioSteps = new Map(scenario.waterfall.steps.map(step => [step.criterion_id, step]));
  function measure(passing: number, newlyExcluded?: number, unresolved?: number) {
    return <div className="comparison-measure"><div className="waterfall-measure"><div className="waterfall-track" aria-hidden="true"><span className="waterfall-fill" style={{width:`${scale ? passing * 100 / scale : 0}%`}} /></div><strong>{passing}</strong></div>
      {newlyExcluded !== undefined && <small><span className="waterfall-excluded">{newlyExcluded ? `−${newlyExcluded}` : "0"} newly excluded</span><span className="waterfall-unresolved">{unresolved} unresolved</span></small>}</div>;
  }
  return <figure className="waterfall-comparison" aria-label="Draft and selected scenario eligibility waterfalls">
    <figcaption><h3>Where the revised criteria change the population.</h3><p>Follow the same patients through the draft and selected criteria. Both waterfalls use the same scale; each bar counts patients meeting every criterion checked so far.</p></figcaption>
    <div className="comparison-scroll" tabIndex={0} role="region" aria-label="Side-by-side eligibility comparison">
      <div className="comparison-chart">
        <div className="comparison-waterfall-row comparison-header"><div>Eligibility criterion</div><div><span>Draft protocol</span><strong>{baseline.counts.passing} eligible</strong></div><div><span>{scenarioTitle}</span><strong>{scenario.counts.passing} eligible</strong></div></div>
        <div className="comparison-waterfall-row comparison-start"><strong>Starting population</strong>{measure(baseline.waterfall.denominator)}{measure(scenario.waterfall.denominator)}</div>
        <ol className="comparison-waterfall-steps">{baseline.waterfall.steps.map(before => {
          const after = scenarioSteps.get(before.criterion_id);
          const original = baseline.criteria.find(c => c.criterion_id === before.criterion_id);
          const revised = scenario.criteria.find(c => c.criterion_id === before.criterion_id);
          const name = original ? criterionName(original) : before.criterion_id;
          const changed = original && revised && criterionStatement(original) !== criterionStatement(revised);
          return <li className="comparison-waterfall-row" key={before.criterion_id} data-changed={Boolean(changed)} aria-label={`${name}: draft ${before.passing} meeting criteria, selected ${after?.passing ?? "not evaluated"}`}>
            <div className="comparison-criterion"><strong>{name}</strong>{changed ? <small className="changed-threshold">{threshold(original) ?? criterionStatement(original)} → {threshold(revised) ?? criterionStatement(revised)}</small> : original && threshold(original) ? <small>{threshold(original)}</small> : null}</div>
            {measure(before.passing,before.newly_failing,before.unresolved)}
            {after ? measure(after.passing,after.newly_failing,after.unresolved) : <p>Not evaluated</p>}
          </li>;
        })}</ol>
        <div className="comparison-waterfall-row comparison-final"><strong>Final eligibility</strong><div><strong>{baseline.counts.passing} eligible</strong><span>{baseline.counts.failing} excluded · {baseline.counts.unresolved} unresolved</span></div><div><strong>{scenario.counts.passing} eligible</strong><span>{scenario.counts.failing} excluded · {scenario.counts.unresolved} unresolved</span></div></div>
      </div>
    </div>
    <p className="waterfall-note">Highlighted rows show the eligibility thresholds that changed. Red counts newly excluded patients; amber tracks unresolved eligibility separately.</p>
  </figure>;
}
