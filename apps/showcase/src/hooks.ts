import { type EligibilityLabClient, type Job, TERMINAL_STATES } from "@kitsa/eligibility-lab-client";
import { useCallback, useEffect, useState } from "react";

export interface Loaded<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads `load()` whenever `deps` change. A response that arrives after the inputs changed is discarded, so a slow
 * answer for an earlier selection can never replace the current one.
 */
export function useLoad<T>(load: (signal: AbortSignal) => Promise<T> | null, deps: readonly unknown[]): Loaded<T> {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({
    data: null, error: null, loading: false,
  });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const pending = load(controller.signal);
    if (pending === null) {
      setState({ data: null, error: null, loading: false });
      return () => controller.abort();
    }
    setState((previous) => ({ ...previous, loading: true, error: null }));
    pending.then(
      (data) => active && setState({ data, error: null, loading: false }),
      (error: unknown) => active && setState({ data: null, error, loading: false }),
    );
    return () => {
      active = false;
      controller.abort();
    };
    // `load` is recreated every render; `deps` name what it depends on.
  }, [...deps, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

/** Polls a job until it ends. Polls for a job that is no longer selected are cancelled and their answers ignored. */
export function useJob(client: EligibilityLabClient, jobId: string | null, intervalMs = 400) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    setJob(null);
    setError(null);
    if (!jobId) return;
    const controller = new AbortController();
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await client.getJob(jobId, controller.signal);
        if (!active) return;
        setJob(next);
        setError(null);
        if (!TERMINAL_STATES.includes(next.state)) timer = setTimeout(poll, intervalMs);
      } catch (failure) {
        if (!active) return;
        setError(failure);
        timer = setTimeout(poll, intervalMs * 5);
      }
    };
    void poll();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [client, jobId, intervalMs, version]);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return { job: job && job.job_id === jobId ? job : null, error, refresh };
}

export interface UrlState {
  bundle: string | null;
  baseline: string | null;
  scenario: string | null;
  interpretation: string | null;
}

function readUrl(): UrlState {
  const params = new URLSearchParams(window.location.search);
  return { bundle: params.get("bundle"), baseline: params.get("baseline"), scenario: params.get("scenario"),
           interpretation: params.get("interpretation") };
}

/** The selected bundle, baseline and scenario live in the address, so a reload resumes the same view. */
export function useUrlState(): [UrlState, (patch: Partial<UrlState>) => void] {
  const [state, setState] = useState<UrlState>(readUrl);
  useEffect(() => {
    const restore = () => setState(readUrl());
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const update = useCallback((patch: Partial<UrlState>) => {
    setState((previous) => {
      const next = { ...previous, ...patch };
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
      const query = params.toString();
      window.history.pushState(null, "", query ? `?${query}` : window.location.pathname);
      return next;
    });
  }, []);
  return [state, update];
}

export function newKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
