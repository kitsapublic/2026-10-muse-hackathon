import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

test.skip(process.env.ELIGIBILITY_LAB_RECORDED_BROWSER !== "1", "requires the installed public recording artifact");

test("portable Muse recordings: baseline, scenarios, lineage, exports and reload without spending", async ({ page, request }, info) => {
  const session = await (await request.get("/v1/session")).json();
  expect(session.modes.recorded.available).toBe(true);
  expect(session.modes.live.available).toBe(false);
  const bundles = await (await request.get("/v1/bundles")).json();
  expect(bundles.map((b: { bundle_key: string }) => b.bundle_key)).toEqual(["elx-nsclc-01-demonstration@1.0.1"]);
  await page.goto("/");
  await expect(page.getByText("10 of 10 interpretations approved")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Live model/ })).toBeDisabled();
  await page.getByRole("radio", { name: /Recorded model/ }).check();
  await page.getByRole("button", { name: "Run baseline" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Baseline" })).toContainText("Complete");
  await expect(page.locator(".showcase__bar .elab-mode")).toHaveText("Recorded model");
  const baselineId = new URL(page.url()).searchParams.get("baseline");
  const baseline = await (await request.get(`/v1/jobs/${baselineId}/report.json`)).json();
  expect(baseline.mode.mode).toBe("recorded");
  expect(baseline.result.counts).toEqual({ passing: 19, failing: 57, unresolved: 24, total: 100 });
  expect(baseline.provider_attempts).toHaveLength(0);
  expect(baseline.lineage).toHaveLength(391);
  expect(baseline.lineage.every((e: { source: { kind: string; transport: string } }) =>
    e.source.kind === "replay" && e.source.transport === "meta-api")).toBe(true);
  expect(baseline.costs.this_job).toEqual({ requests: 0, settled_microusd: 0, held_microusd: 0 });
  expect(baseline.costs.reused.source_settled_microusd).toBe(645200);

  for (const [name, expected] of [["Raise the upper age limit", 29], ["Allow up to three", 23], ["Both changes together", 37]] as const) {
    await page.getByRole("button", { name: new RegExp(`^Use .*${name}`) }).click();
    await page.getByRole("button", { name: "Run scenario" }).click();
    await expect(page.locator(".elab-compare__headline")).toContainText(`${expected} in this scenario`);
  }
  const scenarioId = new URL(page.url()).searchParams.get("scenario");
  const download = async (name: string) => {
    const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name }).click()]);
    return readFileSync((await file.path()) ?? "", "utf8");
  };
  const report = JSON.parse(await download("Scenario report (JSON)"));
  expect(report.mode.mode).toBe("recorded");
  expect(report.result.counts).toEqual({ passing: 37, failing: 33, unresolved: 30, total: 100 });
  expect(report.costs.this_job.requests).toBe(0);
  expect(report.lineage).toEqual(baseline.lineage);
  expect(JSON.stringify(report)).not.toContain(session.action_token);
  const matrix = await download("Baseline decision matrix (CSV)");
  expect(matrix.split("\r\n").filter((row) => row.startsWith('"ELX-D-'))).toHaveLength(100);
  const before = await (await request.get("/v1/jobs")).json();
  await page.reload();
  await expect(page.locator(".elab-compare__headline")).toContainText("19 meet every criterion at baseline, 37 in this scenario (+18)");
  await expect(page.locator(".showcase__bar .elab-mode")).toHaveText("Recorded model");
  expect((await (await request.get("/v1/jobs")).json()).length).toBe(before.length);
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.locator(".elab-compare__headline").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/screens/recorded-portable.png" });
  writeFileSync(info.outputPath("recorded-summary.json"), JSON.stringify({ passed: true, baselineId, scenarioId,
    url: page.url(), provider_requests: 0, source_responses: 391, baseline_counts: baseline.result.counts,
    scenario_counts: report.result.counts }, null, 2));
});
