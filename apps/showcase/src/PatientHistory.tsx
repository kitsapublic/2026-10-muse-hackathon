import { currentEvidence, evidenceName, evidenceValue } from "./clinical-copy";
import type { PatientRecord } from "@kitsa/eligibility-lab-client";
export function PatientHistory({record}:{record:PatientRecord}) {
  const treatments=record.evidence.flatMap(e=>{
    const v=e.value;
    return e.status!=="entered_in_error"&&e.concept==="systemic_anticancer_regimen"&&v&&typeof v==="object"&&"regimen_id" in v&&"start_on" in v&&"last_dose_on" in v?
      [{id:String(v.regimen_id),date:String(v.start_on),end:String(v.last_dose_on??"unknown"),source:e.evidence_id,recorded:e.observed_on}]:[];
  });
  const unique=[...new Map(treatments.sort((a,b)=>a.recorded.localeCompare(b.recorded)).map(t=>[t.id,t])).values()].sort((a,b)=>a.date.localeCompare(b.date));
  return <section className="patient-history" aria-label="Patient history across visits and treatments"><h2>Patient 011: excluded by two draft limits.</h2>
    <p>She is 78 and has had three prior systemic regimens: planned courses of cancer drug treatment. She meets the other eight criteria. The draft allows age 75 or under and at most two regimens, so two limits exclude an otherwise suitable patient.</p>
    <div className="patient-threshold-comparison" role="region" aria-label="Patient 011 eligibility before and after criterion optimization" tabIndex={0}><table className="elab-table"><thead><tr><th>Eligibility criterion</th><th>Patient 011</th><th>Draft criteria</th><th>Revised criteria</th></tr></thead><tbody>
      <tr><th scope="row">Age at assessment</th><td><strong>78 years</strong></td><td>18–75 years<span className="criterion-status" data-classification="failing">Does not meet</span></td><td>18–80 years<span className="criterion-status" data-classification="passing">Meets</span></td></tr>
      <tr><th scope="row">Prior systemic anticancer regimens</th><td><strong>3 regimens</strong></td><td>No more than 2<span className="criterion-status" data-classification="failing">Does not meet</span></td><td>No more than 3<span className="criterion-status" data-classification="passing">Meets</span></td></tr>
    </tbody></table></div>
    <div className="patient-qualification"><div><span>Draft criteria</span><strong>Not eligible</strong></div><span aria-hidden="true">→</span><div><span>Both limits revised</span><strong>Eligible</strong></div><p>She qualifies with an age limit of 80 and up to three prior regimens. Both changes are needed: raising one alone still leaves her excluded.</p></div>
    <p>Her record confirms advanced non-small-cell lung cancer, full activity, adequate blood counts, no active infection and no spread to the brain.</p>
    <div className="ehr-observations">{currentEvidence(record).filter(e => ["birth_date", "disease_stage", "ecog", "neutrophils", "haemoglobin"].includes(e.concept)).map(e => <div key={e.evidence_id}><strong>{evidenceName(e.concept)}</strong><p>{evidenceValue(e, record.reference_date)}</p>{e.concept === "disease_stage" && e.value === "IVA" && <small>Cancer has spread</small>}{e.concept === "ecog" && e.value === 0 && <small>Fully active</small>}{e.concept === "neutrophils" && <small>Minimum required: 1.5 × 10⁹/L</small>}{e.concept === "haemoglobin" && <small>Minimum required: 9.0 g/dL</small>}<small>Recorded {e.observed_on}</small></div>)}</div>
    <h3>Previous cancer treatments (prior systemic regimens)</h3><ol className="history-timeline">{unique.map((t,i)=><li key={t.id}><time dateTime={t.date}>{t.date}</time><h3>Treatment regimen {i+1}</h3><p>The recorded treatment ran through {t.end}.</p><small>{t.source}</small></li>)}
      <li><time dateTime={record.reference_date}>{record.reference_date}</time><h3>Assess the current evidence</h3><p>Use treatment history, current blood tests and notes to check all ten criteria.</p></li></ol>
    <h3>Free-text evidence: scan reports and clinical notes</h3>{record.notes.map(n=><blockquote className="note" key={n.note_id}><p>{n.text}</p><footer>{n.written_on} · {n.note_id}</footer></blockquote>)}
  </section>;
}
