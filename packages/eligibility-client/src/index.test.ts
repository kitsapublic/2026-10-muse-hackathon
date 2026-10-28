import { describe, expect, it } from "vitest";
import { ACTION_HEADER, createEligibilityLabClient, EligibilityLabError } from "./index";

type Call = { method: string; url: string; headers: Headers; body: string };

function fakeService(handler: (call: Call, calls: Call[]) => Response) {
  const calls: Call[] = [];
  const fetch = async (input: Request) => {
    const call = { method: input.method, url: input.url, headers: input.headers, body: await input.text() };
    calls.push(call);
    return handler(call, calls);
  };
  return { calls, client: createEligibilityLabClient({ baseUrl: "http://127.0.0.1:8765", fetch }) };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const session = (token: string) => ({
  action_token: token,
  operator: "local-operator",
  workspace: "local-synthetic",
  service_version: "0.2.0",
  evaluator: {},
  modes: {},
});

describe("eligibility lab client", () => {
  it("reads without a token and sends the session's token with every change", async () => {
    const { calls, client } = fakeService((call) =>
      call.url.endsWith("/v1/session") ? json(session("t-1")) : json({ proposal_id: "p" }),
    );
    await client.listBundles();
    await client.review("prp-1", "approved");
    expect(calls.map((c) => [c.method, new URL(c.url).pathname])).toEqual([
      ["GET", "/v1/bundles"],
      ["GET", "/v1/session"],
      ["POST", "/v1/proposals/prp-1/reviews"],
    ]);
    expect(calls[0]?.headers.get(ACTION_HEADER)).toBeNull();
    expect(calls[2]?.headers.get(ACTION_HEADER)).toBe("t-1");
    expect(JSON.parse(calls[2]?.body ?? "")).toEqual({ decision: "approved" });
  });

  it("sends the idempotency key with a job and encodes identities in paths", async () => {
    const { calls, client } = fakeService((call) =>
      call.url.endsWith("/v1/session") ? json(session("t")) : json({ job_id: "job-1" }, 202),
    );
    await client.submitJob(
      { kind: "baseline", bundle_key: "elx@1.0.1", mode: "reference", proposal_ids: [], confirm_spend: false },
      "key-1",
    );
    await client.getBundle("elx@1.0.1").catch(() => undefined);
    expect(calls[1]?.headers.get("Idempotency-Key")).toBe("key-1");
    expect(calls[2]?.url).toBe("http://127.0.0.1:8765/v1/bundles/elx%401.0.1");
  });

  it("turns refusals into typed errors with the service's code and problems", async () => {
    const { client } = fakeService(() =>
      json({ error: { code: "protected_parameter", message: "I1.age_min is protected", problems: ["p1"] } }, 422),
    );
    const error = await client.getJob("job-x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EligibilityLabError);
    expect(error).toMatchObject({ code: "protected_parameter", status: 422, problems: ["p1"] });
  });

  it("fetches a fresh token once when the service restarted", async () => {
    let token = 0;
    const { calls, client } = fakeService((call) => {
      if (call.url.endsWith("/v1/session")) return json(session(`t-${++token}`));
      return call.headers.get(ACTION_HEADER) === "t-2"
        ? json({ job_id: "job-1" })
        : json({ error: { code: "action_token_required", message: "", problems: [] } }, 403);
    });
    await expect(client.cancelJob("job-1")).resolves.toEqual({ job_id: "job-1" });
    expect(calls.filter((c) => c.method === "POST").length).toBe(2);
  });

  it("builds same-origin download links", () => {
    const { client } = fakeService(() => json({}));
    expect(client.downloads("job-1").matrix).toBe("http://127.0.0.1:8765/v1/jobs/job-1/matrix.csv");
  });
});
