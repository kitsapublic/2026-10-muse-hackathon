import { useState } from "react";
import type { EligibilityLabClient, ItemTrace, Job, PatientRecord, PatientResult, Report, Result } from "@kitsa/eligibility-lab-client";
import { ErrorNotice, ModeBadge, reasonLabel } from "@kitsa/eligibility-ui";
import { useLoad } from "./hooks";
import { criterionName, criterionStatement, evidenceName, evidenceValue } from "./clinical-copy";
import { count, money, pretty, statusLabels } from "./story";

function criterionOutcome(decision: PatientResult, id: string, exclusion: boolean) {
  const cell = decision.cells[id];
  if (!cell || cell.outcome === "execution_failure" || cell.value === null || cell.value === "undetermined" || decision.unresolved_criteria.includes(id)) return { status: "unresolved", label: "Unresolved" };
  if (decision.failing_criteria.includes(id)) return { status: "failing", label: exclusion ? "Exclusion applies" : "Does not meet criterion" };
  return { status: "passing", label: exclusion ? "Exclusion does not apply" : cell.applicability === "not_applicable" ? "Satisfied — not applicable" : "Meets criterion" };
}

export function PatientEvidence({ record, decision, criteria, baselineDecision, baselineCriteria }: {
  record: PatientRecord; decision?: PatientResult; criteria: Result["criteria"];
  baselineDecision?: PatientResult; baselineCriteria?: Result["criteria"];
}) {
  return <div className="patient-evidence">
    <div className="patient-evidence__heading"><h3>{record.patient_id} · EHR and eligibility assessment</h3>
      {decision && <span className="story-status" data-classification={decision.classification}>{statusLabels[decision.classification]}</span>}</div>
    <p>Assessment date: <strong>{record.reference_date}</strong>. The table connects each eligibility criterion to this patient’s clinical evidence. Inclusion criteria must be met; exclusion criteria must not apply.</p>
    {decision && <div className="story-table-scroll eligibility-table" tabIndex={0} role="region" aria-label="Patient eligibility by criterion"><table className="elab-table">
      <caption>{baselineDecision ? "Draft criteria compared with the selected scenario" : "Draft protocol eligibility assessment"}</caption>
      <thead><tr><th>Eligibility criterion</th><th>Patient’s EHR evidence</th>{baselineDecision && <th>Draft result</th>}<th>{baselineDecision ? "Selected scenario" : "Eligibility result"}</th></tr></thead>
      <tbody>{criteria.map(criterion => {
        const id = criterion.criterion_id, cell = decision.cells[id], outcome = criterionOutcome(decision, id, criterion.category === "exclusion");
        const baselineCriterion = baselineCriteria?.find(c => c.criterion_id === id);
        const before = baselineDecision ? criterionOutcome(baselineDecision, id, criterion.category === "exclusion") : null;
        const changed = baselineCriterion && criterionStatement(baselineCriterion) !== criterionStatement(criterion);
        const cited = cell?.evidence ?? [];
        return <tr key={id} data-classification={outcome.status}>
          <th scope="row"><strong>{criterionName(criterion)}</strong><span>{criterion.category === "inclusion" ? "Inclusion" : "Exclusion"}</span><p>{criterionStatement(criterion)}</p>{changed && <small className="criterion-change">Draft: {criterionStatement(baselineCriterion)}</small>}<small>Protocol §{criterion.anchor} · {id}</small></th>
          <td>{cited.length ? <ul className="criterion-evidence">{cited.map(sourceId => {
            const observation = record.evidence.find(e => e.evidence_id === sourceId), note = record.notes.find(n => n.note_id === sourceId);
            return <li key={sourceId}>{observation ? <><strong>{evidenceName(observation.concept)}:</strong> {evidenceValue(observation, record.reference_date)}<small>{observation.observed_on} · {sourceId}{observation.status === "entered_in_error" ? " · entered in error" : ""}</small></> : note ? <><q>{note.text}</q><small>{note.written_on} · {sourceId}</small></> : <span>{sourceId}</span>}</li>;
          })}</ul> : <p>No supporting EHR evidence was retained for this criterion.</p>}</td>
          {before && <td><span className="criterion-status" data-classification={before.status}>{before.label}</span></td>}
          <td><span className="criterion-status" data-classification={outcome.status}>{outcome.label}</span>{cell && outcome.status === "unresolved" && <p>{[...cell.reasons, ...cell.failures].map(reasonLabel).join(" · ")}</p>}</td>
        </tr>;
      })}</tbody></table></div>}
    <h4>Structured EHR data · {record.evidence.length} observations</h4>
    <div className="ehr-observations">{record.evidence.map(e => <div key={e.evidence_id}><strong>{evidenceName(e.concept)}</strong><p>{evidenceValue(e, record.reference_date)}</p><small>{e.observed_on} · {e.evidence_id}{e.status === "entered_in_error" ? " · entered in error" : ""}</small></div>)}</div>
    <h4>Clinical notes · {record.notes.length} source documents</h4>
    {record.notes.length ? record.notes.map(note => <blockquote className="note" key={note.note_id}><p>{note.text}</p><footer>{note.written_on} · {note.note_id}</footer></blockquote>) : <p>This patient has no recorded clinical notes.</p>}
  </div>;
}

function Trace({ trace }: { trace: ItemTrace }) {
  const [expanded, setExpanded] = useState(false);
  const attempt = trace.answer_attempt ?? trace.attempts.at(-1);
  const answer = attempt?.answer && "value" in attempt.answer ? attempt.answer : null;
  const text = attempt?.request.messages.find((m) => m.role === "user")?.content;
  let notes: { note_id: string; text: string; written_on: string }[] = [];
  try {
    const parsed: unknown = JSON.parse(text ?? "null");
    if (parsed && typeof parsed === "object" && "notes" in parsed && Array.isArray(parsed.notes)) {
      notes = parsed.notes.filter((n): n is { note_id: string; text: string; written_on: string } =>
        n && typeof n.note_id === "string" && typeof n.text === "string" && typeof n.written_on === "string");
    }
  } catch { /* The retained request stays available as text below. */ }
  return <article className="trace-card">
    <div className="eyebrow">{trace.narrative_input?.question_id ? pretty(trace.narrative_input.question_id) : "Model request"}
      {trace.answer_source?.kind !== "direct" && <span className="trace-card__source">{pretty(trace.answer_source?.kind ?? "Attempt")}</span>}</div>
    {trace.narrative_input?.statement && <p className="trace-pipeline__label">Statement Muse checks against the notes</p>}
    <h3>{trace.narrative_input?.statement ?? "Criterion interpretation"}</h3>
    {attempt ? <>
      <div className="trace-pipeline">
        <div><span className="trace-pipeline__label">Notes given to Muse</span>
          {notes.map((note) => <blockquote className="note" key={note.note_id} data-cited={answer?.supporting_note_ids.includes(note.note_id)}>
            <p>{note.text}</p><footer>{note.written_on} · {note.note_id}{answer?.supporting_note_ids.includes(note.note_id) ? " · cited" : ""}</footer>
          </blockquote>)}
        </div>
        <div className="trace-answer"><span className="trace-pipeline__label">Muse’s answer</span>
          <strong>{answer ? pretty(answer.value) : "No accepted answer"}</strong>
          <p>{answer?.reason === "insufficient_evidence" ? "The notes do not provide enough evidence to resolve this statement." : answer?.reason === "conflicting_evidence" ? "The notes contain conflicting evidence, so Muse left this statement unresolved." : answer?.reason === "model_abstention" ? "Muse abstained from deciding whether this statement applies." : answer ? (answer.value === "yes" ? "The cited notes support this statement." : "The cited notes show this statement does not apply to the patient.") : "This attempt has no validated answer."}</p>
          <span className="story-status">{attempt.validation?.code === "answered" ? "Answer format and citations verified" : pretty(attempt.validation?.code ?? "pending")}</span>
        </div>
      </div>
      <dl className="trace-metrics">
        <div><dt>Response time</dt><dd>{attempt.latency_ms === null ? "Unavailable" : (attempt.latency_ms / 1000).toFixed(2) + " s"}</dd></div>
        <div><dt>Tokens in / out</dt><dd>{attempt.usage ? count(attempt.usage.prompt_tokens) + " / " + count(attempt.usage.completion_tokens) : "Unavailable"}</dd></div>
        <div><dt>Calculated request cost</dt><dd>{attempt.cost.charged_microusd === null ? "Unsettled" : money(attempt.cost.charged_microusd)}</dd></div>
      </dl>
      <button className="elab-link" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Hide" : "Inspect"} exact request & response</button>
      {expanded && <div className="trace-raw"><h4>Request</h4><pre>{JSON.stringify(attempt.request, null, 2)}</pre>
        <h4>Final response</h4><pre>{attempt.response?.content ?? "No final response was retained."}</pre>
        <p>The selected job sent {trace.attempts.length} {trace.attempts.length === 1 ? "request" : "requests"} for this item. The displayed response used {attempt.model}, and its output token count includes reasoning tokens.</p>
        <p className="elab-ids">Request SHA-256: {attempt.request.request_sha256}<br/>Configuration: {attempt.configuration_sha256}</p>
        <details><summary>Attempt history and validation</summary><pre>{JSON.stringify(trace.attempts.map((a) => ({ attempt_id: a.attempt_id, state: a.state, validation: a.validation, cost: a.cost })), null, 2)}</pre></details>
      </div>}
    </> : <p className="elab-muted">{trace.unavailable_reason === "source_not_visible" ? "This source is not available to the public demo." : "This request has no retained model response. " + pretty(trace.unavailable_reason ?? "not sent")}</p>}
  </article>;
}

export function MuseEvidence({ client, job, patientId, historical = false }: { client: EligibilityLabClient; job: Job | null; patientId: string | null; historical?: boolean }) {
  const [question, setQuestion] = useState(0);
  const owner = job?.kind === "scenario" ? job.baseline_job_id : job?.job_id;
  const loaded = useLoad(async (signal) => {
    if (!job || !owner || !patientId || job.mode === "reference") return null;
    const items = await client.listItems(owner);
    return Promise.all(items.filter((i) => i.kind === "narrative" && i.item_key.startsWith(patientId + "|")).map((i) => client.getItemTrace(job.job_id, i.item_id, signal)));
  }, [client, job?.job_id, job?.state, job?.generation, owner, patientId]);
  if (!job || job.mode === "reference") return <div className="story-empty"><h3>{job ? "Authored reference answers" : "No retained Muse run is installed"}</h3>
    <p>{job ? "This run uses authored reference answers. To inspect Muse requests, select Recorded model or use an enabled live run." : "Install the public recording package to inspect the original requests, or run a model baseline when available."}</p></div>;
  return <div className="muse-evidence">
    <p className="evidence-context"><span className="live-dot" />{historical ? "These responses come from the original live run on 28 October 2026." : "These responses were used by the selected " + job.kind + "."}
      <span>{historical ? "Viewing these responses makes no new calls." : job.mode === "recorded" || job.kind === "scenario" ? "This view reuses existing responses without making model calls." : "Only explicit run controls can make model calls."}</span></p>
    {loaded.error ? <ErrorNotice error={loaded.error} /> : null}
    {loaded.loading && !loaded.data ? <p role="status">Loading retained requests…</p> : null}
    {loaded.data?.length === 0 && <p>No model requests are recorded for this patient. The record may have no notes within the required date ranges.</p>}
    {loaded.data && loaded.data.length > 0 && <><div className="trace-choice" aria-label="Retained questions">{loaded.data.map((trace, i) => <button key={trace.item.item_id} aria-pressed={Math.min(question, loaded.data!.length - 1) === i} onClick={() => setQuestion(i)}>{pretty(trace.narrative_input?.question_id ?? "Question " + (i+1))}</button>)}</div><Trace key={loaded.data[Math.min(question, loaded.data.length - 1)]!.item.item_id} trace={loaded.data[Math.min(question, loaded.data.length - 1)]!} /></>}
    {loaded.error ? <button className="elab-button elab-button--quiet" onClick={loaded.reload}>Reload evidence</button> : null}
  </div>;
}

export function RunMetrics({ report }: { report: Report }) {
  const costs = report.costs, attempts = report.provider_attempts;
  const finished = report.job.finished_at ? Date.parse(report.job.finished_at) : NaN;
  const elapsed = finished - Date.parse(report.job.created_at);
  const input = attempts.reduce((n,a) => n + (a.usage?.prompt_tokens ?? 0), 0);
  const output = attempts.reduce((n,a) => n + (a.usage?.completion_tokens ?? 0), 0);
  const unknownUsage = attempts.some((a) => a.state !== "not_sent" && !a.usage);
  return <div className="run-metrics"><p><strong>Current execution</strong> · <ModeBadge mode={report.job.mode} /></p>
    <dl className="metric-grid">
      <div><dt>New model requests</dt><dd>{costs.this_job.requests}</dd></div>
      <div><dt>New calculated charges</dt><dd>{money(costs.this_job.settled_microusd)}</dd></div>
      <div><dt>Answers reused</dt><dd>{costs.reused.answers}</dd></div>
      <div><dt>Whole-job elapsed</dt><dd>{Number.isFinite(elapsed) && elapsed >= 0 ? (elapsed / 1000).toFixed(2) + " s" : "Not finished"}</dd></div>
    </dl>
    <p className="elab-muted">This job used {count(input)} input tokens and {count(output)} output tokens{unknownUsage ? " for the requests with known usage" : ""}. The output count includes reasoning tokens.
      {costs.this_job.held_microusd > 0 ? " A further " + money(costs.this_job.held_microusd) + " remains reserved for requests whose charges are unresolved." : ""}</p>
    {costs.reused.answers > 0 && <p className="elab-muted">The reused answers originally cost {money(costs.reused.source_settled_microusd)}. Those charges belong to the source runs and are not charged again.</p>}
    <p className="elab-ids">Job {report.job.job_id} · {report.result?.coverage.complete ? "Complete decision coverage" : "Inspect unresolved or incomplete work"}</p>
  </div>;
}
