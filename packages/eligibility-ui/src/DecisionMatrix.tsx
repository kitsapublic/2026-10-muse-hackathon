import { useMemo, useState } from "react";
import type { PatientResult, Result } from "@kitsa/eligibility-lab-client";
import {
  type Classification,
  CLASSIFICATION_LABELS,
  cellDetail,
  cellLabel,
  cellStatus,
  formatCount,
  reasonLabel,
  SOURCE_LABELS,
} from "./labels";

type Filter = "all" | Classification;

function PatientDecisions({ patient, result }: { patient: PatientResult; result: Result }) {
  return (
    <section className="elab-patient" aria-labelledby="elab-patient-heading">
      <h4 id="elab-patient-heading">
        {patient.patient_id}: {CLASSIFICATION_LABELS[patient.classification]}
      </h4>
      <table className="elab-table">
        <thead>
          <tr>
            <th scope="col">Criterion</th>
            <th scope="col">Statement satisfied</th>
            <th scope="col">Why</th>
            <th scope="col">Applies</th>
            <th scope="col">Cited evidence and notes</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {result.criteria.map((criterion) => {
            const cell = patient.cells[criterion.criterion_id];
            if (!cell) return null;
            const status = cellStatus(criterion.criterion_id, patient.failing_criteria, patient.unresolved_criteria);
            return (
              <tr key={criterion.criterion_id} data-status={status}>
                <th scope="row">
                  {criterion.criterion_id} <span className="elab-muted">{criterion.category}</span>
                </th>
                <td>{cellLabel(cell)}</td>
                <td>{[...cell.reasons, ...cell.failures].map(reasonLabel).join(", ")}</td>
                <td>{cell.applicability.replaceAll("_", " ")}</td>
                <td className="elab-ids">{[...cell.evidence, ...cell.narrative_decisions].join(", ") || "None"}</td>
                <td>{cell.sources.map((s) => SOURCE_LABELS[s] ?? s).join(", ") || "None"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export interface DecisionMatrixProps {
  result: Result;
  /** Patients to mark, such as those a scenario changed. */
  marked?: ReadonlySet<string>;
}

/** Every patient and criterion. Statuses come from the engine's per-patient lists. */
export function DecisionMatrix({ result, marked }: DecisionMatrixProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(
    () => result.patients.filter((p) => filter === "all" || p.classification === filter),
    [result, filter],
  );
  const patient = result.patients.find((p) => p.patient_id === selected);
  const filters: Filter[] = ["all", "passing", "unresolved", "failing"];
  return (
    <div className="elab-matrix">
      <fieldset className="elab-matrix__filter">
        <legend>Show patients</legend>
        {filters.map((name) => (
          <label key={name}>
            <input type="radio" name="elab-matrix-filter" checked={filter === name} onChange={() => setFilter(name)} />{" "}
            {name === "all" ? `All ${formatCount(result.patients.length)}` : CLASSIFICATION_LABELS[name]}
          </label>
        ))}
      </fieldset>
      <div className="elab-matrix__scroll" tabIndex={0} role="region" aria-label="Decision matrix">
        <table className="elab-table elab-matrix__table">
          <thead>
            <tr>
              <th scope="col">Patient</th>
              <th scope="col">Classification</th>
              {result.criteria.map((criterion) => (
                <th key={criterion.criterion_id} scope="col" title={criterion.text}>
                  {criterion.criterion_id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.patient_id} data-marked={marked?.has(row.patient_id) ? "true" : undefined}
                  aria-selected={row.patient_id === selected}>
                <th scope="row">
                  <button type="button" className="elab-link" onClick={() => setSelected(row.patient_id)}
                          aria-expanded={row.patient_id === selected}>
                    {row.patient_id}
                  </button>
                </th>
                <td data-classification={row.classification}>{CLASSIFICATION_LABELS[row.classification]}</td>
                {result.criteria.map((criterion) => {
                  const cell = row.cells[criterion.criterion_id];
                  if (!cell) return <td key={criterion.criterion_id}>Missing</td>;
                  const status = cellStatus(criterion.criterion_id, row.failing_criteria, row.unresolved_criteria);
                  const detail = cellDetail(cell);
                  return (
                    <td key={criterion.criterion_id} data-status={status} title={detail}>
                      {cellLabel(cell)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {patient && <PatientDecisions patient={patient} result={result} />}
    </div>
  );
}
