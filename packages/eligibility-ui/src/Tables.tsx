import type { GroupSummary, Job, Result } from "@kitsa/eligibility-lab-client";
import { CLASSIFICATION_LABELS, formatCount } from "./labels";

const AGE_BANDS: Record<string, string> = {
  under_18: "Under 18",
  "18_49": "18 to 49",
  "50_64": "50 to 64",
  "65_74": "65 to 74",
  "75_79": "75 to 79",
  "80_plus": "80 and over",
  unknown: "Not established",
};
const SEXES: Record<string, string> = { female: "Female", male: "Male", unknown: "Not recorded" };

export function ImpactTable({ result }: { result: Result }) {
  const categories = Object.fromEntries(result.criteria.map((c) => [c.criterion_id, c]));
  return (
    <table className="elab-table elab-impact">
      <caption>
        Each criterion waived on its own, every other criterion unchanged. One patient can be blocked by several
        criteria, so these gains overlap and do not add up.
      </caption>
      <thead>
        <tr>
          <th scope="col">Criterion</th>
          <th scope="col">Patients it fails</th>
          <th scope="col">Would meet every criterion if waived</th>
          <th scope="col">Gain</th>
        </tr>
      </thead>
      <tbody>
        {result.criterion_impact.map((entry) => (
          <tr key={entry.criterion_id}>
            <th scope="row">
              {entry.criterion_id}{" "}
              <span className="elab-muted">{categories[entry.criterion_id]?.category ?? ""}</span>
            </th>
            <td>{formatCount(entry.failing)}</td>
            <td>{formatCount(entry.passing_if_waived)}</td>
            <td>
              <span className="elab-bar" style={{ inlineSize: `${(entry.gain / result.counts.total) * 100}%` }} />
              {entry.gain ? `+${formatCount(entry.gain)}` : "0"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface SummaryColumn {
  heading: string;
  summary: GroupSummary;
}

export function SummaryTable({ columns, caption }: { columns: SummaryColumn[]; caption: string }) {
  const rows = (kind: "age_bands" | "sex", labels: Record<string, string>) =>
    Object.keys(labels).map((key) => (
      <tr key={`${kind}-${key}`}>
        <th scope="row">{labels[key]}</th>
        {columns.map((column) => (
          <td key={column.heading}>{formatCount(column.summary[kind][key] ?? 0)}</td>
        ))}
      </tr>
    ));
  return (
    <table className="elab-table elab-summary">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Patients</th>
          {columns.map((column) => (
            <th key={column.heading} scope="col">
              {column.heading} ({formatCount(column.summary.patients)})
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr className="elab-summary__section">
          <th scope="rowgroup" colSpan={columns.length + 1}>Age on the evaluation date</th>
        </tr>
        {rows("age_bands", AGE_BANDS)}
        <tr className="elab-summary__section">
          <th scope="rowgroup" colSpan={columns.length + 1}>Recorded sex</th>
        </tr>
        {rows("sex", SEXES)}
      </tbody>
    </table>
  );
}

export function CohortSummaries({ result }: { result: Result }) {
  const groups = result.summaries;
  const columns: SummaryColumn[] = [];
  if (groups.cohort) columns.push({ heading: "Whole cohort", summary: groups.cohort });
  for (const name of ["passing", "unresolved", "failing"] as const) {
    const summary = groups[name];
    if (summary) columns.push({ heading: CLASSIFICATION_LABELS[name], summary });
  }
  return <SummaryTable columns={columns} caption="Who falls into each classification." />;
}

export function ExecutionMetrics({ result, job }: { result: Result; job?: Job | null }) {
  const engine = result.execution_metrics;
  const provider = job?.result?.metrics?.provider as
    | { requests?: number; charged_microusd?: number; tokens?: Record<string, number> }
    | null
    | undefined;
  const processing = job?.result?.metrics?.processing_ms as number | undefined;
  return (
    <dl className="elab-metrics">
      <div>
        <dt>Engine calculation</dt>
        <dd>{(engine.elapsed_us / 1000).toFixed(1)} ms</dd>
      </div>
      <div>
        <dt>Decisions computed</dt>
        <dd>
          {formatCount(engine.decisions_computed)} of {formatCount(engine.cells)}
        </dd>
      </div>
      <div>
        <dt>Decisions reused from earlier runs</dt>
        <dd>{formatCount(engine.decisions_reused)}</dd>
      </div>
      {processing !== undefined && (
        <div>
          <dt>Whole job on the service</dt>
          <dd>{formatCount(processing)} ms</dd>
        </div>
      )}
      {provider ? (
        <div>
          <dt>Model requests</dt>
          <dd>
            {formatCount(provider.requests ?? 0)} requests, ${((provider.charged_microusd ?? 0) / 1_000_000).toFixed(4)}
          </dd>
        </div>
      ) : (
        <div>
          <dt>Model requests</dt>
          <dd>None</dd>
        </div>
      )}
    </dl>
  );
}
