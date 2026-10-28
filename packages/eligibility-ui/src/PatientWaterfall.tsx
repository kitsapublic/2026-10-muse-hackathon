import type { PatientResult, Result } from "@kitsa/eligibility-lab-client";
import { type Classification, formatCount } from "./labels";

type Strip = { patientId: string; status: Classification }[];

/**
 * Each patient's status after the first `step + 1` criteria in the waterfall order, read from the engine's own
 * per-patient lists of failing and unresolved criteria. The strips are drawn only when they reproduce the engine's
 * counts at every step; otherwise only the engine's counts are shown.
 */
export function patientSteps(result: Result): { order: string[]; patients: PatientResult[]; strips: Strip[] } | null {
  const order = result.waterfall.order;
  const position = new Map(order.map((criterion, index) => [criterion, index]));
  const first = (criteria: readonly string[]) =>
    Math.min(...criteria.map((c) => position.get(c) ?? Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
  const rank: Record<Classification, number> = { passing: 0, unresolved: 1, failing: 2 };
  const timeline = result.patients.map((patient) => ({
    patient,
    fails: first(patient.failing_criteria),
    unsure: first(patient.unresolved_criteria),
  }));
  timeline.sort((a, b) =>
    rank[a.patient.classification] - rank[b.patient.classification] || b.fails - a.fails ||
    a.patient.patient_id.localeCompare(b.patient.patient_id));
  const strips = order.map((_, step) =>
    timeline.map(({ patient, fails, unsure }) => ({
      patientId: patient.patient_id,
      status: (fails <= step ? "failing" : unsure <= step ? "unresolved" : "passing") as Classification,
    })),
  );
  const agrees = result.waterfall.steps.every((engine, step) => {
    const strip = strips[step] ?? [];
    return (["passing", "failing", "unresolved"] as const).every(
      (status) => strip.filter((cell) => cell.status === status).length === engine[status],
    );
  });
  return agrees ? { order, patients: timeline.map((t) => t.patient), strips } : null;
}

export function CohortStrip({ strip, marked, label }: { strip: Strip; marked?: ReadonlySet<string>; label?: string }) {
  const width = strip.length;
  return (
    <svg className="elab-strip" viewBox={`0 0 ${width} 10`} preserveAspectRatio="none" aria-hidden={label ? undefined : true}
         role={label ? "img" : undefined} aria-label={label} focusable="false">
      {strip.map((cell, index) => (
        <rect key={cell.patientId} x={index + 0.08} y={marked?.has(cell.patientId) ? 0 : 1.5} width={0.84}
              height={marked?.has(cell.patientId) ? 10 : 7} className={`elab-strip__cell elab-strip__cell--${cell.status}`}
              data-marked={marked?.has(cell.patientId) ? "true" : undefined}>
          <title>{cell.patientId}</title>
        </rect>
      ))}
    </svg>
  );
}

export interface PatientWaterfallProps {
  result: Result;
  /** Criterion anchors and categories by id, for row labels. */
  criteria: Record<string, { anchor: string; category: string }>;
}

/** The waterfall drawn per patient: every row is the whole cohort, so each step reconciles to the denominator. */
export function PatientWaterfall({ result, criteria }: PatientWaterfallProps) {
  const steps = patientSteps(result);
  const denominator = result.waterfall.denominator;
  return (
    <table className="elab-waterfall">
      <caption>
        Criteria applied cumulatively in protocol order; each row counts all {formatCount(denominator)} patients.
      </caption>
      <thead>
        <tr>
          <th scope="col">After criterion</th>
          {steps && <th scope="col" className="elab-waterfall__strip-head">Patients</th>}
          <th scope="col">Meets so far</th>
          <th scope="col">Fails</th>
          <th scope="col">Unresolved</th>
          <th scope="col">Newly failing</th>
        </tr>
      </thead>
      <tbody>
        {result.waterfall.steps.map((step, index) => {
          const criterion = criteria[step.criterion_id];
          return (
            <tr key={step.criterion_id}>
              <th scope="row">
                <span className="elab-waterfall__id">{step.criterion_id}</span>{" "}
                <span className="elab-waterfall__anchor">
                  {criterion ? `${criterion.anchor}, ${criterion.category}` : ""}
                </span>
              </th>
              {steps && (
                <td className="elab-waterfall__strip">
                  <CohortStrip strip={steps.strips[index] ?? []} />
                </td>
              )}
              <td>{formatCount(step.passing)}</td>
              <td>{formatCount(step.failing)}</td>
              <td>{formatCount(step.unresolved)}</td>
              <td>{step.newly_failing ? `+${formatCount(step.newly_failing)}` : "0"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
