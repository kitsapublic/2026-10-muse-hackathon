/**
 * The generated client against a running service (set ELIGIBILITY_LAB_URL, e.g. http://127.0.0.1:8765, with the
 * public demonstration bundle installed). Skipped otherwise. It creates its own reviews and jobs.
 */
import { describe, expect, it } from "vitest";
import { createEligibilityLabClient, EligibilityLabError, TERMINAL_STATES, type Job } from "./index";

const url = process.env.ELIGIBILITY_LAB_URL;

async function finished(client: ReturnType<typeof createEligibilityLabClient>, job: Job): Promise<Job> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const current = await client.getJob(job.job_id);
    if (TERMINAL_STATES.includes(current.state)) return current;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`job ${job.job_id} did not finish`);
}

describe.skipIf(!url)("generated client against the running service", () => {
  const client = createEligibilityLabClient({ baseUrl: url ?? "" });

  it("runs a baseline and a scenario and reads typed results, comparisons and refusals", async () => {
    const session = await client.session();
    expect(session.modes.reference.available).toBe(true);
    expect(session.modes.live.available).toBe(false);
    const [bundle] = await client.listBundles();
    expect(bundle?.bundle_key).toBe("elx-nsclc-01-demonstration@1.0.1");
    const detail = await client.getBundle(bundle!.bundle_key);
    expect(detail.scenario_parameters.map((p) => `${p.criterion_id}.${p.parameter}`)).toEqual([
      "I1.age_max",
      "I7.max_regimens",
    ]);
    const proposals = (await client.listProposals(bundle!.bundle_key)).filter((p) => p.origin === "reference");
    for (const proposal of proposals) await client.review(proposal.proposal_id, "approved");
    const key = `client-${crypto.randomUUID()}`;
    const request = {
      kind: "baseline" as const, bundle_key: bundle!.bundle_key, mode: "reference" as const,
      proposal_ids: proposals.map((p) => p.proposal_id), confirm_spend: false,
    };
    const submitted = await client.submitJob(request, key);
    expect((await client.submitJob(request, key)).job_id).toBe(submitted.job_id);
    const baseline = await finished(client, submitted);
    expect(baseline.result?.counts).toEqual({ passing: 19, failing: 57, unresolved: 24, total: 100 });
    const result = await client.getResult(baseline.job_id);
    expect(result.result.patients).toHaveLength(100);
    const refused = await client
      .submitJob({ kind: "scenario", baseline_job_id: baseline.job_id,
                   edits: [{ criterion_id: "I5", parameter: "anc_min", value: "1.0" }] }, `client-${crypto.randomUUID()}`)
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(EligibilityLabError);
    expect((refused as EligibilityLabError).code).toBe("protected_parameter");
    const scenario = await finished(client, await client.submitJob(
      { kind: "scenario", baseline_job_id: baseline.job_id, scenario_id: "scenario-b" }, `client-${crypto.randomUUID()}`));
    const comparison = await client.getComparison(scenario.job_id);
    expect(comparison.comparison.passing_delta).toBe(4);
    expect(comparison.comparison.baseline.run_id).toBe(baseline.result?.run_id);
    const matrix = await fetch(client.downloads(baseline.job_id).matrix);
    expect(matrix.headers.get("content-type")).toContain("text/csv");
  });
});
