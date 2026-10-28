/**
 * Typed client for the Eligibility Lab `/v1` API. `schema.ts` is generated from the service's published OpenAPI
 * schema (`npm run generate`); this module adds the session's action token to changes and turns every refusal into
 * an `EligibilityLabError` carrying the service's code, message and problems.
 *
 * The service binds to loopback and answers only its own origin, so the client is used same-origin (or through a
 * development proxy that preserves that boundary). It holds no credentials: the action token is a per-process CSRF
 * token, and model credentials never leave the service.
 */
import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export type { components, paths } from "./schema";
type Schemas = components["schemas"];
export type Session = Schemas["Session"];
export type ModeState = Schemas["ModeState"];
export type Mode = Schemas["Job"]["mode"];
export type BundleSummary = Schemas["BundleSummary"];
export type BundleDetail = Schemas["BundleDetail"];
export type CriterionView = Schemas["CriterionView"];
export type ScenarioParameter = Schemas["ScenarioParameter"];
export type SavedScenario = Schemas["SavedScenario"];
export type Proposal = Schemas["Proposal"];
export type Job = Schemas["Job"];
export type JobState = Job["state"];
export type Item = Schemas["Item"];
export type JobResult = Schemas["JobResult"];
export type Result = Schemas["Result"];
export type PatientResult = Schemas["PatientResult"];
export type Cell = Schemas["Cell"];
export type Counts = Schemas["Counts"];
export type GroupSummary = Schemas["GroupSummary"];
export type JobComparison = Schemas["JobComparison"];
export type Comparison = Schemas["Comparison"];
export type EditSpec = Schemas["EditSpec"];
export type Experiment = Schemas["Experiment"];
export type BaselineJobRequest = Schemas["BaselineJobRequest"];
export type ScenarioJobRequest = Schemas["ScenarioJobRequest"];
export type InterpretationJobRequest = Schemas["InterpretationJobRequest"];
export type JobRequest = BaselineJobRequest | ScenarioJobRequest | InterpretationJobRequest;

export const ACTION_HEADER = "X-Eligibility-Lab-Action";
export const TERMINAL_STATES: readonly JobState[] = ["succeeded", "partial", "failed", "cancelled"];

export class EligibilityLabError extends Error {
  readonly code: string;
  readonly status: number;
  readonly problems: readonly string[];

  constructor(code: string, message: string, status: number, problems: readonly string[] = []) {
    super(message);
    this.name = "EligibilityLabError";
    this.code = code;
    this.status = status;
    this.problems = problems;
  }
}

export interface ClientOptions {
  /** The service origin; empty for the page's own origin. */
  baseUrl?: string;
  fetch?: (input: Request) => Promise<Response>;
}

export interface Downloads {
  report: string;
  matrix: string;
  comparison: string;
}

async function refusal(response: Response, body: unknown): Promise<EligibilityLabError> {
  const error = (body as { error?: { code?: unknown; message?: unknown; problems?: unknown } } | undefined)?.error;
  if (error && typeof error.code === "string" && typeof error.message === "string") {
    const problems = Array.isArray(error.problems) ? error.problems.filter((p) => typeof p === "string") : [];
    return new EligibilityLabError(error.code, error.message, response.status, problems);
  }
  return new EligibilityLabError("http_error", `The service answered ${response.status}.`, response.status);
}

export function createEligibilityLabClient(options: ClientOptions = {}) {
  const baseUrl = options.baseUrl ?? "";
  const fetchImpl = options.fetch ?? ((input: Request) => globalThis.fetch(input));
  const api = createClient<paths>({ baseUrl, fetch: fetchImpl });
  let session: Promise<Session> | null = null;

  async function unwrap<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
    const { data, error, response } = await call;
    if (!response.ok || data === undefined) {
      throw await refusal(response, error);
    }
    return data;
  }

  function loadSession(): Promise<Session> {
    session ??= unwrap(api.GET("/v1/session")).catch((error: unknown) => {
      session = null;
      throw error;
    });
    return session;
  }

  /** A change carrying the action token; when the service restarted with a new token, fetch it once and retry. */
  async function change<T>(send: (token: string) => Promise<{ data?: T; error?: unknown; response: Response }>) {
    try {
      return await unwrap(send((await loadSession()).action_token));
    } catch (error) {
      if (error instanceof EligibilityLabError && error.code === "action_token_required") {
        session = null;
        return unwrap(send((await loadSession()).action_token));
      }
      throw error;
    }
  }

  const token = (value: string) => ({ [ACTION_HEADER]: value });

  return {
    session: loadSession,
    listBundles: () => unwrap(api.GET("/v1/bundles")),
    getBundle: (bundleKey: string) =>
      unwrap(api.GET("/v1/bundles/{bundle_key}", { params: { path: { bundle_key: bundleKey } } })),
    listProposals: (bundleKey: string) =>
      unwrap(api.GET("/v1/bundles/{bundle_key}/proposals", { params: { path: { bundle_key: bundleKey } } })),
    review: (proposalId: string, decision: "approved" | "rejected") =>
      change((value) =>
        api.POST("/v1/proposals/{proposal_id}/reviews", {
          params: { path: { proposal_id: proposalId } },
          body: { decision },
          headers: token(value),
        }),
      ),
    editProposal: (proposalId: string, interpretation: Record<string, unknown>) =>
      change((value) =>
        api.POST("/v1/proposals/{proposal_id}/edits", {
          params: { path: { proposal_id: proposalId } },
          body: { interpretation },
          headers: token(value),
        }),
      ),
    /** Submit a job; the same key and request return the existing job instead of a new one. */
    submitJob: (request: JobRequest, idempotencyKey: string) =>
      change((value) =>
        api.POST("/v1/jobs", {
          params: { header: { "Idempotency-Key": idempotencyKey } },
          body: request,
          headers: token(value),
        }),
      ),
    listJobs: (bundleKey?: string) =>
      unwrap(api.GET("/v1/jobs", { params: { query: bundleKey ? { bundle_key: bundleKey } : {} } })),
    getJob: (jobId: string, signal?: AbortSignal) =>
      unwrap(api.GET("/v1/jobs/{job_id}", { params: { path: { job_id: jobId } }, ...(signal ? { signal } : {}) })),
    listItems: (jobId: string) => unwrap(api.GET("/v1/jobs/{job_id}/items", { params: { path: { job_id: jobId } } })),
    cancelJob: (jobId: string) =>
      change((value) =>
        api.POST("/v1/jobs/{job_id}/cancel", { params: { path: { job_id: jobId } }, headers: token(value) }),
      ),
    resumeJob: (jobId: string) =>
      change((value) =>
        api.POST("/v1/jobs/{job_id}/resume", { params: { path: { job_id: jobId } }, headers: token(value) }),
      ),
    retryItems: (jobId: string, itemIds: string[]) =>
      change((value) =>
        api.POST("/v1/jobs/{job_id}/retries", {
          params: { path: { job_id: jobId } },
          body: { item_ids: itemIds },
          headers: token(value),
        }),
      ),
    getResult: (jobId: string, signal?: AbortSignal) =>
      unwrap(
        api.GET("/v1/jobs/{job_id}/result", { params: { path: { job_id: jobId } }, ...(signal ? { signal } : {}) }),
      ),
    getComparison: (jobId: string, signal?: AbortSignal) =>
      unwrap(
        api.GET("/v1/jobs/{job_id}/comparison", {
          params: { path: { job_id: jobId } },
          ...(signal ? { signal } : {}),
        }),
      ),
    ledger: () => unwrap(api.GET("/v1/ledger")),
    downloads: (jobId: string): Downloads => {
      const base = `${baseUrl}/v1/jobs/${encodeURIComponent(jobId)}`;
      return { report: `${base}/report.json`, matrix: `${base}/matrix.csv`, comparison: `${base}/comparison.csv` };
    },
  };
}

export type EligibilityLabClient = ReturnType<typeof createEligibilityLabClient>;
