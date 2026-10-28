import type { Counts, Job, Mode, ModeState, Session } from "@kitsa/eligibility-lab-client";
import {
  CLASSIFICATION_HINTS,
  CLASSIFICATION_LABELS,
  CLASSIFICATIONS,
  formatCount,
  MODE_HINTS,
  MODE_LABELS,
  STATE_LABELS,
} from "./labels";

export function ModeBadge({ mode }: { mode: Mode }) {
  return (
    <span className="elab-mode" data-mode={mode} title={MODE_HINTS[mode]}>
      {MODE_LABELS[mode]}
    </span>
  );
}

export interface ModeChooserProps {
  modes: Session["modes"];
  value: Mode;
  onChange: (mode: Mode) => void;
  disabled?: boolean;
}

/** Every mode is listed; an unavailable one stays visible and says why, and is never silently replaced. */
export function ModeChooser({ modes, value, onChange, disabled }: ModeChooserProps) {
  const entries: [Mode, ModeState][] = [
    ["reference", modes.reference],
    ["recorded", modes.recorded],
    ["live", modes.live],
  ];
  return (
    <fieldset className="elab-modes" disabled={disabled}>
      <legend>Answers come from</legend>
      {entries.map(([mode, state]) => (
        <label key={mode} className="elab-modes__option" data-available={state.available}>
          <input
            type="radio"
            name="elab-mode"
            value={mode}
            checked={value === mode}
            disabled={!state.available}
            onChange={() => onChange(mode)}
            aria-describedby={`elab-mode-${mode}`}
          />
          <span className="elab-modes__name">{MODE_LABELS[mode]}</span>
          <span id={`elab-mode-${mode}`} className="elab-modes__hint">
            {state.available ? MODE_HINTS[mode] : (state.reason ?? "Unavailable.")}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export interface JobStatusProps {
  job: Job;
  title: string;
  onCancel?: () => void;
  onResume?: () => void;
  busy?: boolean;
  resumeDisabled?: boolean;
}

export function JobStatus({ job, title, onCancel, onResume, busy, resumeDisabled }: JobStatusProps) {
  const running = job.state === "queued" || job.state === "running";
  const progress = job.progress;
  return (
    <div className="elab-job" data-state={job.state}>
      <p className="elab-job__line" role="status" aria-live="polite">
        <span className="elab-job__title">{title}</span>{" "}
        <span className="elab-job__state">{STATE_LABELS[job.state]}</span>
        {job.cancel_requested && running ? ", stopping after requests already sent" : ""}
        {progress.total > 0 ? (
          <span className="elab-job__progress">
            {" "}
            {formatCount(progress.answered)} of {formatCount(progress.total)} model answers
            {progress.failed ? `, ${progress.failed} failed` : ""}
            {progress.ambiguous ? `, ${progress.ambiguous} ambiguous` : ""}
            {progress.skipped ? `, ${progress.skipped} not sent` : ""}
          </span>
        ) : null}
      </p>
      {job.state === "partial" && (
        <p className="elab-job__note">
          Some decisions could not be made. Every patient is still counted; cells that could not be evaluated stay
          unresolved instead of becoming a clinical answer.
        </p>
      )}
      {job.state === "cancelled" && <p className="elab-job__note">Cancelled before a result was committed.</p>}
      {job.error && (
        <ErrorNotice error={job.error} />
      )}
      <div className="elab-job__actions">
        {running && onCancel && (
          <button type="button" className="elab-button elab-button--quiet" onClick={onCancel}
                  disabled={busy || job.cancel_requested}>
            Cancel run
          </button>
        )}
        {(job.state === "cancelled" || job.state === "partial" || job.state === "failed") && onResume && (
          <button type="button" className="elab-button elab-button--quiet" onClick={onResume} disabled={busy || resumeDisabled}>
            Resume run
          </button>
        )}
      </div>
    </div>
  );
}

export function CohortCounts({ counts, caption }: { counts: Counts; caption?: string }) {
  return (
    <dl className="elab-counts" aria-label={caption ?? "Patients by classification"}>
      {CLASSIFICATIONS.map((name) => (
        <div key={name} className="elab-counts__group" data-classification={name}>
          <dt title={CLASSIFICATION_HINTS[name]}>{CLASSIFICATION_LABELS[name]}</dt>
          <dd>
            <span className="elab-counts__value">{formatCount(counts[name])}</span>
            <span className="elab-counts__of"> of {formatCount(counts.total)}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export interface ErrorNoticeProps {
  error: unknown;
}

export function ErrorNotice({ error }: ErrorNoticeProps) {
  if (!error) return null;
  const detail = error as { code?: string; message?: string; problems?: readonly string[] };
  return (
    <div className="elab-error" role="alert">
      <p>
        {detail.message || "The request failed."}
        {detail.code ? ` (${detail.code})` : ""}
      </p>
      {detail.problems && detail.problems.length > 0 && (
        <ul>
          {detail.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
