import type { Result } from "@kitsa/eligibility-lab-client";
import type { Scene } from "./story";

export function TechnicalSection({ scene, result }: { scene: Scene; result?: Result }) {
  const content = {
    question: <><h2 id="technical-question">Turn the drafted criteria into rules a computer can apply.</h2><p>Muse Spark 1.3 proposes structured rules from protocol text for reviewer approval. This demo uses reviewed reference rules; Muse’s original proposals remain available to inspect.</p><code className="technical-example">“Age 18–75 years” → age_min: 18, age_max: 75</code></>,
    muse: <><h2 id="technical-muse">Extract a clinical fact with its source.</h2><p>Muse Spark 1.3 receives a question and dated notes through the Meta Model API. It returns yes, no or undetermined with source citations. The service checks the answer format and citations.</p><blockquote className="technical-example">“No clinical signs of infection…” → active infection: no · source: the patient’s clinical note</blockquote></>,
    baseline: <><h2 id="technical-baseline">Calculate eligibility cumulatively.</h2><p>The engine combines structured values and accepted Muse answers in a {result ? `${result.counts.total} × ${result.criteria.length}` : "patient × criterion"} decision matrix: one decision per patient and criterion. The waterfall counts exclusions once and keeps unresolved cases separate.</p><p className="technical-detail">At scale, an orchestrator would distribute patient batches and preserve progress for recovery.</p></>,
    scenarios: <><h2 id="technical-scenarios">Change thresholds; reuse the clinical evidence.</h2><p>Only age and prior-treatment limits change. The engine reuses accepted Muse answers to recalculate eligibility, with no new model calls.</p><p className="technical-detail">An optimization agent could test ranges approved by the clinical team.</p></>,
    evidence: <><h2 id="technical-evidence">Trace the gain to individual patients.</h2><p>Match draft and revised results by patient ID to identify who needs either change or both. Count each newly eligible patient once.</p><p className="technical-detail">Muse performance figures come from the original live run.</p></>,
    review: <><h2 id="technical-review">Export a reproducible protocol decision.</h2><p>The JSON export links the proposed edits to the protocol version and selected runs, with changed patients, unresolved evidence and report links.</p><p className="technical-detail">A protocol-writing agent could turn the approved package into a protocol revision.</p></>,
  };
  return <section className="technical-section" aria-labelledby={`technical-${scene}`}><p className="eyebrow">Technical</p>{content[scene]}</section>;
}
