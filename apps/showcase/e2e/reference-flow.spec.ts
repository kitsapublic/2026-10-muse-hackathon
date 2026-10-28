import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * The complete reference workflow in a real browser against a running service with a fresh store: review every
 * interpretation, run the baseline, the two permitted scenarios and both together, compare, export, reload, and
 * check keyboard operation, accessibility and stale-response handling. The expected counts are the reference case's
 * independently specified ones (19/57/24 at baseline; 29, 23 and 37 passing in the scenarios).
 */

test.skip(process.env.ELIGIBILITY_LAB_SYNTHETIC_BROWSER === "1", "reference-only service test");

const SCREENS = "test-results/screens";

async function counts(page: Page, label: string): Promise<string[]> {
  const group = page.getByLabel(label);
  return group.locator("dd").allInnerTexts();
}

async function axe(page: Page) {
  const report = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return report.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} nodes`);
}

test("reference workflow: review, baseline, scenarios, comparison, export and recovery", async ({ page, request }) => {
  const bundles = await (await request.get("/v1/bundles")).json();
  expect(bundles.map((b: { bundle_key: string }) => b.bundle_key)).toEqual(["elx-nsclc-01-demonstration@1.0.1"]);

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Simulate who qualifies, and what a change would do");
  await expect(page.getByText("100 synthetic patients")).toBeVisible();
  await expect(page.locator(".showcase__bar .elab-mode")).toHaveText("Reference answers");
  await expect(page.getByRole("radio", { name: /Recorded model/ })).toBeDisabled();
  await expect(page.getByRole("radio", { name: /Live model/ })).toBeDisabled();
  await expect(page.getByText("0 of 10 interpretations approved")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run baseline" })).toBeDisabled();
  await page.screenshot({ path: `${SCREENS}/01-review.png`, fullPage: false });

  // Keyboard: approve the first interpretation with Enter, then the rest with one action.
  const firstApprove = page.getByRole("button", { name: "Approve", exact: true }).first();
  await firstApprove.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("1 of 10 interpretations approved")).toBeVisible();
  await page.getByRole("button", { name: "Approve all shown" }).click();
  await expect(page.getByText("10 of 10 interpretations approved")).toBeVisible();
  expect(await axe(page)).toEqual([]);

  const run = page.getByRole("button", { name: "Run baseline" });
  await run.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("status").filter({ hasText: "Baseline" })).toContainText("Complete");
  expect(await counts(page, "Baseline patients by classification")).toEqual(["19 of 100", "24 of 100", "57 of 100"]);
  const waterfall = page.getByRole("table", { name: /Criteria applied cumulatively/ });
  await expect(waterfall.getByRole("row")).toHaveCount(11);
  await expect(waterfall.getByRole("row").last()).toContainText("E2");
  await page.screenshot({ path: `${SCREENS}/02-baseline.png`, fullPage: true });
  const baselineId = new URL(page.url()).searchParams.get("baseline");
  expect(baselineId).toMatch(/^job-/);

  const presets: [string, string, string][] = [
    ["Raise the upper age limit from 75 to 80 years", "29", "+10"],
    ["Allow up to three prior systemic anticancer regimens", "23", "+4"],
  ];
  for (const [title, passing, change] of presets) {
    await page.getByRole("button", { name: `Use “${title}”` }).click();
    await page.getByRole("button", { name: "Run scenario" }).click();
    const row = page.getByRole("row", { name: new RegExp(title) });
    await expect(row).toContainText(passing);
    await expect(row).toContainText(change);
  }
  // Both changes typed by hand: overlapping gains are recalculated, not added (10 + 4 is not 18).
  await page.getByRole("spinbutton", { name: "Upper age limit, in years" }).fill("80");
  await page.getByRole("spinbutton", { name: "Most prior systemic regimens allowed" }).fill("3");
  await page.getByRole("button", { name: "Run scenario" }).click();
  const both = page.getByRole("row", { name: /Both changes together/ });
  await expect(both).toContainText("37");
  await expect(both).toContainText("+18");

  const runs = await (await request.get(`/v1/jobs?bundle_key=${encodeURIComponent(bundles[0].bundle_key)}`)).json();
  const scenarioIds = runs.filter((j: { kind: string }) => j.kind === "scenario").map((j: { job_id: string }) => j.job_id);
  expect(scenarioIds).toHaveLength(3);

  // Stale responses: hold the first comparison, select another, then release the first.
  const ageRun = runs.find((j: { scenario?: { scenario_id?: string } }) => j.scenario?.scenario_id === "scenario-a");
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/v1/jobs/${ageRun.job_id}/comparison`, async (route) => {
    await held;
    await route.continue();
  });
  await page.getByRole("button", { name: /Compare Raise the upper age limit/ }).click();
  await page.getByRole("button", { name: /Compare Both changes together/ }).click();
  const headline = page.locator(".elab-compare__headline");
  await expect(headline).toContainText("19 meet every criterion at baseline, 37 in this scenario (+18)");
  release();
  await page.waitForTimeout(500);
  await expect(headline).toContainText("37 in this scenario (+18)");
  await page.unroute(`**/v1/jobs/${ageRun.job_id}/comparison`);
  const transitions = page.getByRole("table", { name: /Patients by baseline classification/ });
  await expect(transitions.getByRole("row", { name: /^Fails a criterion/ })).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/03-comparison.png`, fullPage: true });
  expect(await axe(page)).toEqual([]);

  // Exports.
  const download = async (name: string) => {
    const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name }).click()]);
    return readFileSync((await file.path()) ?? "", "utf8");
  };
  const matrix = await download("Baseline decision matrix (CSV)");
  expect(matrix.split("\r\n")[2]).toContain('"patient_id","classification","I1 value"');
  expect(matrix.split("\r\n").filter((line) => line.startsWith('"ELX-D-'))).toHaveLength(100);
  const report = JSON.parse(await download("Scenario report (JSON)"));
  expect(report.format).toBe("kitsa/eligibility-lab-service-report/2");
  expect(report.mode.mode).toBe("reference");
  expect(report.configuration.provider).toBeNull();
  expect(report.configuration_sha256).toBe(report.job.configuration_sha256);
  expect(report.lineage).toEqual([]);
  expect(report.costs.this_job).toEqual({ requests: 0, settled_microusd: 0, held_microusd: 0 });
  expect(report.result.counts).toEqual({ passing: 37, failing: 33, unresolved: 30, total: 100 });
  const session = await (await request.get("/v1/session")).json();
  expect(JSON.stringify(report)).not.toContain(session.action_token);
  expect(JSON.stringify(report)).not.toContain("elx-nsclc-01-evaluation");
  const changed = await download("Changed patients (CSV)");
  expect(changed).toContain('"patient_id","from","to","changed_criteria"');

  // Reload: the address restores the baseline and the compared scenario without resubmitting.
  const before = runs.length;
  await page.reload();
  await expect(page.locator(".elab-compare__headline")).toContainText("+18");
  expect(await counts(page, "Baseline patients by classification")).toEqual(["19 of 100", "24 of 100", "57 of 100"]);
  const after = await (await request.get(`/v1/jobs?bundle_key=${encodeURIComponent(bundles[0].bundle_key)}`)).json();
  expect(after.length).toBe(before);

  // Every displayed count came from the service: compare with the job record.
  const baseline = await (await request.get(`/v1/jobs/${baselineId}`)).json();
  expect(baseline.result.counts).toEqual({ passing: 19, failing: 57, unresolved: 24, total: 100 });
});

test("changes from another origin or without the action token are refused", async ({ request }) => {
  const proposals = await (await request.get("/v1/bundles/elx-nsclc-01-demonstration%401.0.1/proposals")).json();
  const target = `/v1/proposals/${proposals[0].proposal_id}/reviews`;
  const noToken = await request.post(target, { data: { decision: "rejected" } });
  expect(noToken.status()).toBe(403);
  const session = await (await request.get("/v1/session")).json();
  const foreign = await request.post(target, {
    data: { decision: "rejected" },
    headers: { "X-Eligibility-Lab-Action": session.action_token, Origin: "http://evil.example" },
  });
  expect(foreign.status()).toBe(403);
  expect(foreign.headers()["access-control-allow-origin"]).toBeUndefined();
});
