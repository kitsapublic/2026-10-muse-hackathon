import { expect, test } from "@playwright/test";

test.skip(process.env.ELIGIBILITY_LAB_SYNTHETIC_BROWSER !== "1", "requires the synthetic provider fixture");

test("synthetic model job: consent, cancellation, reload, resume, explicit retry and interpretation review", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Approve all shown" }).click();
  await expect(page.getByText("4 of 4 interpretations approved")).toBeVisible();
  await page.getByRole("radio", { name: /Live model/ }).check();
  await expect(page.getByRole("button", { name: "Run baseline" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /Allow model requests that spend/ }).check();
  await page.getByRole("button", { name: "Run baseline" }).click();
  await expect.poll(async () => (await (await request.get("/__test__/counts")).json()).narrative).toBe(1);
  const baseline = new URL(page.url()).searchParams.get("baseline");
  expect(baseline).toBeTruthy();
  await page.getByRole("button", { name: "Cancel run" }).click();
  const session = await (await request.get("/v1/session")).json();
  await request.post("/__test__/release", { headers: { "X-Eligibility-Lab-Action": session.action_token } });
  await expect(page.getByText("Cancelled before a result was committed.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Cancelled before a result was committed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume run" })).toBeDisabled();
  await page.getByRole("radio", { name: /Live model/ }).check();
  await page.getByRole("checkbox", { name: /Allow model requests that spend/ }).check();
  await page.getByRole("button", { name: "Resume run" }).click();
  await expect(page.getByRole("button", { name: "Retry 1 failed or ambiguous requests" })).toBeVisible();
  await expect(page.getByLabel("Baseline patients by classification")).toContainText("of 6");
  await expect.poll(async () => (await (await request.get("/__test__/counts")).json()).narrative).toBe(15);
  await page.getByRole("button", { name: "Retry 1 failed or ambiguous requests" }).click();
  await expect.poll(async () => (await (await request.get(`/v1/jobs/${baseline}`)).json()).state).toBe("succeeded");
  expect((await (await request.get("/__test__/counts")).json()).narrative).toBe(16);
  const result = await (await request.get(`/v1/jobs/${baseline}/report.json`)).json();
  expect(result.result.counts.total).toBe(6);
  expect(result.configuration.transport).toBe("synthetic-fixture");
  expect(result.provider_attempts).toHaveLength(16);

  await page.getByText("Interpret criteria with Muse").click();
  const interpret = page.getByRole("button", { name: "Request model interpretations" });
  await expect(interpret).toBeDisabled();
  await page.getByRole("checkbox", { name: /Allow criterion interpretation requests/ }).check();
  await interpret.click();
  await expect(page.getByRole("status").filter({ hasText: "Criterion interpretation" })).toContainText("Complete");
  const bundle = (await (await request.get("/v1/bundles")).json())[0].bundle_key;
  const proposals = await (await request.get(`/v1/bundles/${encodeURIComponent(bundle)}/proposals`)).json();
  const models = proposals.filter((p: { origin: string }) => p.origin === "model");
  expect(models).toHaveLength(4);
  expect(models.every((p: { review: unknown }) => p.review === null)).toBe(true);
  expect((await (await request.get("/__test__/counts")).json()).interpretation).toBe(4);
});
