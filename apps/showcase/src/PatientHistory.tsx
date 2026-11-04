import { currentEvidence, evidenceName, evidenceValue } from "./clinical-copy";
import type { PatientRecord } from "@kitsa/eligibility-lab-client";
export function PatientHistory({record}:{record:PatientRecord}) {
  const treatments=record.evidence.flatMap(e=>{
    const v=e.value;
    return e.status!=="entered_in_error"&&e.concept==="systemic_anticancer_regimen"&&v&&typeof v==="object"&&"regimen_id" in v&&"start_on" in v&&"last_dose_on" in v?
      [{id:String(v.regimen_id),date:String(v.start_on),end:String(v.last_dose_on??"unknown"),source:e.evidence_id,recorded:e.observed_on}]:[];
  });
  const unique=[...new Map(treatments.sort((a,b)=>a.recorded.localeCompare(b.recorded)).map(t=>[t.id,t])).values()].sort((a,b)=>a.date.localeCompare(b.date));
  return <section className="patient-history" aria-label="Patient history across visits and treatments"><h2>Patient 011: Excluded because of unoptimized eligibility criteria.</h2>
    <p>She is 78 and has received three prior systemic anticancer regimens. The draft protocol excludes her on both counts, even though she meets the other eight criteria. Here is exactly what would change her eligibility.</p>
    <div className="patient-threshold-comparison" role="region" aria-label="Patient 011 eligibility before and after criterion optimization" tabIndex={0}><table className="elab-table"><thead><tr><th>Eligibility criterion</th><th>Patient 011</th><th>Draft protocol</th><th>Revised criteria</th></tr></thead><tbody>
      <tr><th scope="row">Age at assessment</th><td><strong>78 years</strong></td><td>18–75 years<span className="criterion-status" data-classification="failing">Does not meet criterion</span></td><td>18–80 years<span className="criterion-status" data-classification="passing">Meets criterion</span></td></tr>
      <tr><th scope="row">Prior systemic anticancer regimens</th><td><strong>3 regimens</strong></td><td>No more than 2<span className="criterion-status" data-classification="failing">Does not meet criterion</span></td><td>No more than 3<span className="criterion-status" data-classification="passing">Meets criterion</span></td></tr>
    </tbody></table></div>
    <div className="patient-qualification"><div><span>Draft criteria</span><strong>Not eligible</strong></div><span aria-hidden="true">→</span><div><span>Both criteria revised</span><strong>Eligible</strong></div><p>Had the protocol allowed ages 18–80 and up to three prior systemic regimens, Patient 011 would have qualified. Both changes are needed: changing only one still leaves her failing the other.</p></div>
    <p>Her EHR shows confirmed metastatic NSCLC, ECOG performance status 0, blood counts above the required thresholds, no active infection and no brain metastases.</p>
    <div className="ehr-observations">{currentEvidence(record).filter(e => ["birth_date", "disease_stage", "ecog", "neutrophils", "haemoglobin"].includes(e.concept)).map(e => <div key={e.evidence_id}><strong>{evidenceName(e.concept)}</strong><p>{evidenceValue(e, record.reference_date)}</p><small>Recorded {e.observed_on}</small></div>)}</div>
    <h3>Prior systemic anticancer therapy across visits</h3><ol className="history-timeline">{unique.map((t,i)=><li key={t.id}><time dateTime={t.date}>{t.date}</time><h3>Systemic regimen {i+1}</h3><p>The recorded treatment ran through {t.end}.</p><small>{t.source}</small></li>)}
      <li><time dateTime={record.reference_date}>{record.reference_date}</time><h3>Assess the current evidence</h3><p>Combine the treatment history, current labs and clinical notes to assess all ten eligibility criteria.</p></li></ol>
    <h3>Unstructured evidence: imaging and clinical notes</h3>{record.notes.map(n=><blockquote className="note" key={n.note_id}><p>{n.text}</p><footer>{n.written_on} · {n.note_id}</footer></blockquote>)}
  </section>;
}
