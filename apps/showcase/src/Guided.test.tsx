import type { Job } from "@kitsa/eligibility-lab-client";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import * as story from "./story";
import { fakeClient, job } from "./fake-client";
import { interactionGroups, reviewDocument } from "./story";

describe("guided story safety and restoration", () => {
  it("navigates scenes and restores Back without creating jobs or downloading detailed reports", async () => {
    const {client} = fakeClient();
    const submit = vi.spyOn(client,"submitJob"), report = vi.spyOn(client,"getReport");
    render(<App client={client}/>);
    await screen.findByText("An invented protocol.");
    await userEvent.click(screen.getByRole("button",{name:"Read one patient’s health record →"}));
    expect(screen.getByRole("heading",{level:1})).toHaveFocus();
    expect(window.location.search).toContain("scene=muse");
    act(()=>{window.history.replaceState(null,"","?scene=question");window.dispatchEvent(new PopStateEvent("popstate"));});
    expect(screen.getByRole("heading",{level:1})).toHaveTextContent("Simulate Clinical Trials");
    expect(submit).not.toHaveBeenCalled(); expect(report).not.toHaveBeenCalled();
  });
  it("requires explicit reference selection when recordings are absent", async () => {
    const {client,proposals} = fakeClient();
    proposals.forEach(p=>p.review={review_id:"r",decision:"approved",reviewer:"test",created_at:"now"});
    window.history.replaceState(null,"","?scene=baseline");
    render(<App client={client}/>);
    await screen.findByRole("button",{name:"Use reference answers"});
    expect(screen.getByRole("button",{name:"Screen all 4 patients"})).toBeDisabled();
    await userEvent.click(screen.getByRole("button",{name:"Use reference answers"}));
    expect(screen.getByRole("button",{name:"Screen all 4 patients"})).toBeEnabled();
    expect(screen.queryByRole("checkbox",{name:/Allow model/})).not.toBeInTheDocument();
  });
  it("restores the selected patient and does not display a scenario from another baseline", async () => {
    const {client,addBaseline,jobs} = fakeClient();addBaseline("job-base");
    jobs.set("unrelated",job("unrelated",{kind:"scenario",baseline_job_id:"other",result:{run_id:"r",content_digest:"d",counts:{passing:99,failing:0,unresolved:0,total:99},coverage_complete:true,metrics:{}}}));
    const result = vi.spyOn(client,"getResult");
    window.history.replaceState(null,"","?baseline=job-base&scenario=unrelated&scene=scenarios&patient=P3");
    render(<App client={client}/>);
    await screen.findByRole("button",{name:"Run selected scenario"});
    expect(screen.queryByLabelText("Cohort outcomes")).not.toBeInTheDocument();
    expect(result).not.toHaveBeenCalledWith("unrelated",expect.anything());
    await userEvent.click(screen.getByRole("button",{name:"03 Evaluate the draft criteria"}));
    await expect(screen.findByRole("button",{name:"P3: Not eligible"})).resolves.toHaveAttribute("aria-pressed","true");
  });
  it("a slow submission cannot replace context after switching bundles", async () => {
    let finish: (j:Job)=>void = ()=>{};
    const f = fakeClient({submitJob:()=>new Promise(resolve=>{finish=resolve;})});
    f.proposals.forEach(p=>p.review={review_id:"r",decision:"approved",reviewer:"test",created_at:"now"});
    const submit = vi.spyOn(f.client,"submitJob");
    window.history.replaceState(null,"","?scene=baseline&mode=reference");
    render(<App client={f.client}/>);
    await waitFor(()=>expect(screen.getByRole("button",{name:"Screen all 4 patients"})).toBeEnabled());
    await userEvent.dblClick(screen.getByRole("button",{name:"Screen all 4 patients"}));
    expect(submit).toHaveBeenCalledTimes(1);
    act(()=>{window.history.replaceState(null,"","?bundle=different&scene=question");window.dispatchEvent(new PopStateEvent("popstate"));});
    await act(async()=>finish(job("late")));
    expect(window.location.search).not.toContain("baseline=late");
  });
  it("continues directly from population comparison to an export without site selection", async () => {
    const {client,addBaseline} = fakeClient(); addBaseline("job-base");
    const scenario = await client.submitJob({kind:"scenario",baseline_job_id:"job-base",scenario_id:"scenario-a"},"k");
    const siteRequests = vi.spyOn(client,"getSiteEvidence");
    const save = vi.spyOn(story,"saveJson").mockImplementation(()=>{});
    window.history.replaceState(null,"",`?baseline=job-base&scenario=${scenario.job_id}&scene=evidence`);
    render(<App client={client}/>);
    await screen.findByRole("heading",{name:"2 → 3 eligible patients with the selected criteria."});
    expect(within(screen.getByRole("navigation",{name:"Story progress"})).getAllByRole("button")).toHaveLength(6);
    await userEvent.click(screen.getByRole("button",{name:"Review the proposed criteria →"}));
    const exportButton = screen.getByRole("button",{name:"Export review package ↓"});
    expect(exportButton).toBeEnabled();
    await userEvent.click(exportButton);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0]).toMatchObject({baseline:{job_id:"job-base"},scenario:{job_id:scenario.job_id}});
    expect(save.mock.calls[0]![0]).not.toHaveProperty("site_planning");
    expect(siteRequests).not.toHaveBeenCalled();
    save.mockRestore();
  });
  it("exports are bound to the selected baseline and scenario identities", async () => {
    const {client,addBaseline} = fakeClient(); addBaseline("job-base");
    const scenario = await client.submitJob({kind:"scenario",baseline_job_id:"job-base",scenario_id:"scenario-a"},"k");
    const base = await client.getResult("job-base"), after = await client.getResult(scenario.job_id), comparison = await client.getComparison(scenario.job_id);
    const detail = await client.getBundle("elx@1");
    expect(reviewDocument(detail,base,after,comparison,client.downloads).scenario.counts.passing).toBe(3);
    expect(()=>reviewDocument(detail,base,{...after,job:{...after.job,baseline_job_id:"wrong"}},comparison,client.downloads)).toThrow(/Select a scenario/);
    const groups = interactionGroups(base.result,after.result,base.result,after.result);
    expect(groups.ageOnly).toEqual(["P3"]);expect(groups.bothRequired).toEqual([]);
  });
});
