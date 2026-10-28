import { EligibilityLabError, type JobComparison } from "@kitsa/eligibility-lab-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { comparisonFor, fakeClient, job } from "./fake-client";

describe("showcase workflow", () => {
  it("reviews, runs the baseline and a scenario, then compares them", async () => {
    const { client } = fakeClient();
    const submit = vi.spyOn(client, "submitJob");
    render(<App client={client} />);
    expect(await screen.findByText("An invented protocol.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run baseline" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Approve all shown" }));
    expect(await screen.findByText("2 of 2 interpretations approved")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Run baseline" }));
    expect(submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "baseline", mode: "reference", proposal_ids: ["prp-I1", "prp-E1"] }),
      expect.stringMatching(/^baseline-/),
    );
    const counts = await screen.findByLabelText("Baseline patients by classification");
    expect(within(counts).getByText("Meets every criterion").nextSibling).toHaveTextContent("2 of 4");
    expect(window.location.search).toBe("?baseline=job-1");
    await userEvent.click(screen.getByRole("button", { name: /Use “Raise the upper age limit”/ }));
    await userEvent.click(screen.getByRole("button", { name: "Run scenario" }));
    expect(submit).toHaveBeenLastCalledWith(
      { kind: "scenario", baseline_job_id: "job-1", scenario_id: "scenario-a" }, expect.stringMatching(/^scenario-/));
    expect(await screen.findByText(/in this scenario/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Changed patients (CSV)" })).toHaveAttribute(
      "href", "/v1/jobs/job-2/comparison.csv");
  });

  it("never lets a slow answer for an earlier selection replace the current one", async () => {
    let releaseFirst: (value: JobComparison) => void = () => undefined;
    const { client, addBaseline, jobs } = fakeClient({
      getComparison: (jobId: string) =>
        jobId === "job-a"
          ? new Promise<JobComparison>((resolve) => { releaseFirst = resolve; })
          : Promise.resolve(comparisonFor(jobId, 4)),
    });
    addBaseline("job-base");
    for (const id of ["job-a", "job-b"]) {
      jobs.set(id, job(id, { kind: "scenario", baseline_job_id: "job-base",
                             scenario: { scenario_id: id, edits: null, title: null },
                             result: { run_id: id, content_digest: id, coverage_complete: true, metrics: {},
                                       counts: { passing: 3, failing: 1, unresolved: 0, total: 4 } } }));
    }
    window.history.replaceState(null, "", "?baseline=job-base&scenario=job-a");
    render(<App client={client} />);
    await userEvent.click(await screen.findByRole("button", { name: "Compare job-b" }));
    expect(await screen.findByText(/in this scenario/)).toHaveTextContent("4 in this scenario");
    releaseFirst(comparisonFor("job-a", 3));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText(/in this scenario/)).toHaveTextContent("4 in this scenario");
    expect(window.location.search).toContain("scenario=job-b");
  });

  it("names saved scenarios by title and keeps their runs current until they finish", async () => {
    const { client, addBaseline, jobs } = fakeClient();
    addBaseline("job-base");
    const running = job("job-s", { kind: "scenario", baseline_job_id: "job-base", state: "running",
                                   scenario: { scenario_id: "scenario-a", edits: null, title: null } });
    jobs.set("job-s", running);
    let listed = 0;
    client.listJobs = async () => {
      listed += 1;
      if (listed > 2) {
        jobs.set("job-s", { ...running, state: "succeeded", result: {
          run_id: "r", content_digest: "d", coverage_complete: true, metrics: {},
          counts: { passing: 3, failing: 1, unresolved: 0, total: 4 } } });
      }
      return [...jobs.values()];
    };
    window.history.replaceState(null, "", "?baseline=job-base");
    render(<App client={client} />);
    const row = await screen.findByRole("row", { name: /Raise the upper age limit/ });
    await waitFor(() => expect(row).toHaveTextContent("Complete"), { timeout: 3000 });
    expect(row).toHaveTextContent("+1");
  });

  it("restores the selected runs from the address after a reload, without submitting again", async () => {
    const { client, addBaseline } = fakeClient();
    addBaseline("job-base");
    const submit = vi.spyOn(client, "submitJob");
    window.history.replaceState(null, "", "?baseline=job-base");
    render(<App client={client} />);
    expect(await screen.findByLabelText("Baseline patients by classification")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Criteria applied cumulatively/ })).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it("shows a cancelled run and resumes it on request", async () => {
    const { client, jobs } = fakeClient();
    jobs.set("job-c", job("job-c", { state: "cancelled", result: null }));
    const resume = vi.spyOn(client, "resumeJob");
    window.history.replaceState(null, "", "?baseline=job-c");
    render(<App client={client} />);
    expect(await screen.findByText("Cancelled before a result was committed.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resume run" }));
    expect(resume).toHaveBeenCalledWith("job-c");
  });

  it("explains partial results and keeps every patient", async () => {
    const { client, jobs } = fakeClient();
    jobs.set("job-p", job("job-p", { state: "partial",
                                     progress: { pending: 0, dispatched: 0, answered: 10, failed: 2, ambiguous: 1,
                                                 skipped: 3, total: 16 } }));
    window.history.replaceState(null, "", "?baseline=job-p");
    render(<App client={client} />);
    expect(await screen.findByText(/10 of 16 model answers, 2 failed, 1 ambiguous, 3 not sent/)).toBeInTheDocument();
    expect(screen.getByText(/Every patient is still counted/)).toBeInTheDocument();
  });

  it("shows the service's refusal instead of a result", async () => {
    const { client } = fakeClient({
      submitJob: async () => {
        throw new EligibilityLabError("protected_parameter", "I1.age_min is protected and cannot be edited", 422,
                                      ["I1.age_min"]);
      },
    });
    render(<App client={client} />);
    await userEvent.click(await screen.findByRole("button", { name: "Approve all shown" }));
    await screen.findByText("2 of 2 interpretations approved");
    await userEvent.click(screen.getByRole("button", { name: "Run baseline" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("I1.age_min is protected and cannot be edited (protected_parameter)");
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("sends a live baseline only after the spending confirmation, and retries failed work explicitly", async () => {
    const { client, jobs } = fakeClient();
    client.session = async () => ({
      ...(await fakeClient().client.session()),
      modes: { reference: { available: true, reason: null, label: "" },
               recorded: { available: false, reason: "None retained.", label: "" },
               live: { available: true, reason: null, label: "", experiment_id: "stage-2b" } },
    });
    const partial = job("job-1", { mode: "live", state: "partial",
                                   progress: { pending: 0, dispatched: 0, answered: 3, failed: 1, ambiguous: 1,
                                               skipped: 0, total: 5 } });
    const submit = vi.fn(async () => {
      jobs.set("job-1", partial);
      return partial;
    });
    client.submitJob = submit;
    client.listItems = async () => [
      { item_id: "job-1.0", position: 0, kind: "narrative", item_key: "a", state: "failed", outcome: null,
        current_attempt: "att-1", retry_of: null, answer_attempt: null },
      { item_id: "job-1.1", position: 1, kind: "narrative", item_key: "b", state: "ambiguous", outcome: null,
        current_attempt: "att-2", retry_of: null, answer_attempt: null },
      { item_id: "job-1.2", position: 2, kind: "narrative", item_key: "c", state: "answered", outcome: null,
        current_attempt: "att-3", retry_of: null, answer_attempt: "att-3" }];
    const retry = vi.spyOn(client, "retryItems");
    render(<App client={client} />);
    await userEvent.click(await screen.findByRole("button", { name: "Approve all shown" }));
    await screen.findByText("2 of 2 interpretations approved");
    await userEvent.click(screen.getByRole("radio", { name: /Live model/ }));
    const run = screen.getByRole("button", { name: "Run baseline" });
    expect(run).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /Allow model requests that spend/ }));
    await userEvent.click(run);
    expect(submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "live", experiment_id: "stage-2b", confirm_spend: true }), expect.any(String));
    await userEvent.click(await screen.findByRole("button", { name: "Retry 2 failed or ambiguous requests" }));
    expect(retry).toHaveBeenCalledWith("job-1", ["job-1.0", "job-1.1"]);
  });

  it("keeps unavailable model modes visible and explains them", async () => {
    const { client } = fakeClient();
    render(<App client={client} />);
    expect(await screen.findByRole("radio", { name: /Recorded model/ })).toBeDisabled();
    expect(screen.getByText("No genuine model responses have been retained yet.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Reference answers/ })).toBeChecked();
  });
  it("requests interpretations only with consent and restores their status without resubmission", async () => {
    const { client, jobs } = fakeClient();
    client.session = async () => ({
      ...(await fakeClient().client.session()),
      modes: { reference: { available: true, reason: null, label: "" },
               recorded: { available: false, reason: "None.", label: "" },
               live: { available: true, reason: null, label: "", experiment_id: "test-exp" } },
    });
    const submitted = job("interpret-1", { kind: "interpretation", mode: "live", state: "running", result: null });
    const submit = vi.spyOn(client, "submitJob").mockImplementation(async () => {
      jobs.set(submitted.job_id, submitted);
      return submitted;
    });
    const view = render(<App client={client} />);
    await userEvent.click(await screen.findByText("Interpret criteria with Muse"));
    const button = screen.getByRole("button", { name: "Request model interpretations" });
    expect(button).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /Allow criterion interpretation requests/ }));
    await userEvent.click(button);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      kind: "interpretation", criterion_ids: ["I1", "E1"], confirm_spend: true, experiment_id: "test-exp",
    }), expect.stringMatching(/^interpretation-/));
    expect(await screen.findByText("Criterion interpretation")).toBeInTheDocument();
    expect(button).toBeDisabled();
    expect(window.location.search).toContain("interpretation=interpret-1");
    view.unmount();
    render(<App client={client} />);
    await userEvent.click(await screen.findByText("Interpret criteria with Muse"));
    expect(await screen.findByText("Criterion interpretation")).toBeInTheDocument();
    expect(submit).toHaveBeenCalledTimes(1);
  });

});
