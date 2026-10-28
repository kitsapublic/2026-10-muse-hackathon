import { useId, useState } from "react";
import type { Comparison, EditSpec, Result, SavedScenario, ScenarioParameter } from "@kitsa/eligibility-lab-client";
import { CLASSIFICATION_LABELS, CLASSIFICATIONS, formatCount, signed } from "./labels";
import { CohortStrip, patientSteps } from "./PatientWaterfall";
import { SummaryTable } from "./Tables";

const key = (parameter: { criterion_id: string; parameter: string }) => `${parameter.criterion_id}.${parameter.parameter}`;

export interface ScenarioControlsProps {
  /** The parameters the service permits; nothing else can be edited. */
  parameters: readonly ScenarioParameter[];
  presets: readonly SavedScenario[];
  /** Readable names by `criterion.parameter`. */
  labels?: Record<string, string>;
  /** Called with the changed parameters, and the saved scenario they exactly match, if any. */
  onRun: (edits: EditSpec[], savedScenarioId: string | null) => void;
  disabled?: boolean;
}

export function ScenarioControls({ parameters, presets, labels, onRun, disabled }: ScenarioControlsProps) {
  const id = useId();
  const baseline = Object.fromEntries(parameters.map((p) => [key(p), Number(p.value)]));
  const [values, setValues] = useState<Record<string, number>>(baseline);
  const edits: EditSpec[] = parameters
    .filter((p) => values[key(p)] !== Number(p.value))
    .map((p) => ({ criterion_id: p.criterion_id, parameter: p.parameter, value: values[key(p)] ?? Number(p.value) }));
  const invalid = parameters.filter((p) => {
    const value = values[key(p)];
    return value === undefined || !Number.isInteger(value) || value < Number(p.minimum) || value > Number(p.maximum);
  });
  const matching = presets.find(
    (preset) =>
      preset.edits.length === edits.length &&
      preset.edits.every((e) => edits.some((m) => key(m) === key(e) && m.value === e.value)),
  );
  return (
    <form
      className="elab-scenario"
      onSubmit={(event) => {
        event.preventDefault();
        if (edits.length && !invalid.length) onRun(edits, matching?.scenario_id ?? null);
      }}
    >
      <fieldset disabled={disabled}>
        <legend>Change a permitted threshold</legend>
        {parameters.map((parameter) => {
          const name = key(parameter);
          const value = values[name];
          return (
            <div key={name} className="elab-scenario__field">
              <label htmlFor={`${id}-${name}`}>{labels?.[name] ?? name}</label>
              <input
                id={`${id}-${name}`}
                type="number"
                inputMode="numeric"
                min={Number(parameter.minimum)}
                max={Number(parameter.maximum)}
                step={1}
                value={Number.isNaN(value) ? "" : value}
                aria-describedby={`${id}-${name}-hint`}
                onChange={(event) => setValues({ ...values, [name]: event.currentTarget.valueAsNumber })}
              />
              <span id={`${id}-${name}-hint`} className="elab-muted">
                Protocol value {String(parameter.value)}; allowed {String(parameter.minimum)} to {String(parameter.maximum)}
              </span>
            </div>
          );
        })}
        {presets.length > 0 && (
          <div className="elab-scenario__presets" role="group" aria-label="Saved scenarios">
            {presets.map((preset) => (
              <button
                key={preset.scenario_id}
                type="button"
                className="elab-button elab-button--quiet"
                onClick={() => {
                  const next = { ...baseline };
                  for (const edit of preset.edits) next[key(edit)] = Number(edit.value);
                  setValues(next);
                }}
              >
                Use “{preset.title}”
              </button>
            ))}
          </div>
        )}
        {invalid.length > 0 && (
          <p className="elab-error" role="alert">
            Enter a whole number within the allowed range for {invalid.map((p) => labels?.[key(p)] ?? key(p)).join(" and ")}.
          </p>
        )}
        <button type="submit" className="elab-button" disabled={!edits.length || invalid.length > 0}>
          Run scenario
        </button>
        {!edits.length && <span className="elab-muted"> Change a value to create a scenario.</span>}
      </fieldset>
    </form>
  );
}

export interface ComparisonViewProps {
  comparison: Comparison;
  baseline?: Result | null;
  scenario?: Result | null;
}

export function ComparisonView({ comparison, baseline, scenario }: ComparisonViewProps) {
  const changed = new Set(comparison.changed_patients.map((p) => p.patient_id));
  const before = baseline ? patientSteps(baseline) : null;
  const after = scenario ? patientSteps(scenario) : null;
  const order = before?.patients.map((p) => p.patient_id) ?? [];
  const finalAfter = after ? new Map((after.strips.at(-1) ?? []).map((c) => [c.patientId, c.status])) : null;
  const passingBefore = comparison.baseline.counts.passing;
  const passingAfter = comparison.scenario.counts.passing;
  return (
    <div className="elab-compare">
      <p className="elab-compare__headline">
        <span className="elab-compare__number">{formatCount(passingBefore)}</span> meet every criterion at baseline,{" "}
        <span className="elab-compare__number">{formatCount(passingAfter)}</span> in this scenario (
        <span className="elab-compare__delta">{signed(comparison.passing_delta)}</span>)
      </p>
      <p className="elab-muted">
        Both runs recalculated on the same {formatCount(comparison.baseline.counts.total)} patients and evaluation date{" "}
        {comparison.evaluation_date}.
        {comparison.complete ? "" : " Some decisions could not be made; those patients stay unresolved."}
      </p>
      {before && finalAfter && (
        <figure className="elab-compare__strips">
          <figcaption>Every patient before and after; patients whose classification changed are drawn taller.</figcaption>
          <div className="elab-compare__row">
            <span>Baseline</span>
            <CohortStrip strip={before.strips.at(-1) ?? []} marked={changed} />
          </div>
          <div className="elab-compare__row">
            <span>Scenario</span>
            <CohortStrip
              strip={order.map((patientId) => ({ patientId, status: finalAfter.get(patientId) ?? "unresolved" }))}
              marked={changed}
            />
          </div>
        </figure>
      )}
      <table className="elab-table elab-transitions">
        <caption>Patients by baseline classification (rows) and scenario classification (columns).</caption>
        <thead>
          <tr>
            <th scope="col">Baseline</th>
            {CLASSIFICATIONS.map((to) => (
              <th key={to} scope="col">{CLASSIFICATION_LABELS[to]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CLASSIFICATIONS.map((from) => (
            <tr key={from}>
              <th scope="row">{CLASSIFICATION_LABELS[from]}</th>
              {CLASSIFICATIONS.map((to) => {
                const count = comparison.transitions[`${from}->${to}`] ?? 0;
                return (
                  <td key={to} data-moved={from !== to && count > 0 ? "true" : undefined}>
                    {formatCount(count)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <table className="elab-table">
        <caption>Patients whose classification or decisions changed ({formatCount(comparison.changed_patients.length)}).</caption>
        <thead>
          <tr>
            <th scope="col">Patient</th>
            <th scope="col">Baseline</th>
            <th scope="col">Scenario</th>
            <th scope="col">Decisions that changed</th>
          </tr>
        </thead>
        <tbody>
          {comparison.changed_patients.map((patient) => (
            <tr key={patient.patient_id}>
              <th scope="row">{patient.patient_id}</th>
              <td>{CLASSIFICATION_LABELS[patient.from]}</td>
              <td>{CLASSIFICATION_LABELS[patient.to]}</td>
              <td>
                {patient.changed_criteria.map((c) => `${c.criterion_id}: ${c.from} to ${c.to}`).join("; ") || "None"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <SummaryTable
        caption="Who meets every criterion, before and after."
        columns={[
          ...(comparison.summaries.baseline.passing
            ? [{ heading: "Baseline: meets every criterion", summary: comparison.summaries.baseline.passing }]
            : []),
          ...(comparison.summaries.scenario.passing
            ? [{ heading: "Scenario: meets every criterion", summary: comparison.summaries.scenario.passing }]
            : []),
        ]}
      />
    </div>
  );
}
