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
  const [loadedFor, setLoadedFor] = useState<readonly unknown[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const pending = load(controller.signal);
    setLoadedFor(deps);
    if (pending === null) {
      setState({ data: null, error: null, loading: false });
      return () => controller.abort();
    }
    const same = loadedFor.length === deps.length && loadedFor.every((value, index) => Object.is(value, deps[index]));
    setState((previous) => ({ data: same ? previous.data : null, loading: true, error: null }));
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
  const matches = loadedFor.length === deps.length && loadedFor.every((value, index) => Object.is(value, deps[index]));
  return { ...(matches ? state : { data: null, error: null, loading: true }), reload };
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
  scene: string | null;
  patient: string | null;
  view: string | null;
  mode: string | null;
}

function readUrl(): UrlState {
  const params = new URLSearchParams(window.location.search);
  return { bundle: params.get("bundle"), baseline: params.get("baseline"), scenario: params.get("scenario"),
           interpretation: params.get("interpretation"), scene: params.get("scene"), patient: params.get("patient"),
           view: params.get("view"), mode: params.get("mode") };
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
    const next = { ...readUrl(), ...patch };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    const query = params.toString();
    const target = query ? `?${query}` : window.location.pathname;
    if (window.location.search !== (query ? `?${query}` : "")) window.history.pushState(null, "", target);
    setState(next);
  }, []);
  return [state, update];
}

export function newKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
