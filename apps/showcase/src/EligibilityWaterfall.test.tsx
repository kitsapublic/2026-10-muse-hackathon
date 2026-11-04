import type { Result } from "@kitsa/eligibility-lab-client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import recorded from "../../../evidence/demonstration-recorded-report.json";
import combined from "../../../evidence/scenario-ab-report.json";
import ageOnly from "../../../evidence/scenario-a-report.json";
import { EligibilityWaterfall, EligibilityWaterfallComparison } from "./EligibilityWaterfall";

const result = recorded.result as unknown as Result;

describe("cumulative eligibility waterfall", () => {
  it("counts each exclusion once and keeps unresolved patients distinct from exclusions", () => {
    render(<EligibilityWaterfall result={result}/>);
    const chart = screen.getByRole("figure",{name:"Cumulative eligibility waterfall"});
    expect(within(chart).getByText("100 patients → 19 eligible")).toBeVisible();
    const rows = within(chart).getAllByRole("listitem");
    expect(rows).toHaveLength(10);
    expect(rows[0]).toHaveAccessibleName("Age at assessment: 68 meet all criteria so far; 26 newly excluded; 6 unresolved so far");
    // Seventeen patients fail the prior-regimen criterion, but ten already failed an earlier criterion.
    expect(result.patients.filter(p => p.failing_criteria.includes("I7"))).toHaveLength(17);
    expect(rows[6]).toHaveAccessibleName("Prior systemic anticancer regimens: 25 meet all criteria so far; 7 newly excluded; 24 unresolved so far");
    expect(rows[9]).toHaveAccessibleName("CNS metastases: 19 meet all criteria so far; 0 newly excluded; 24 unresolved so far");
    expect(within(chart).getByText("57 excluded")).toBeVisible();
    expect(within(chart).getByText("24 unresolved")).toBeVisible();
    const fills = chart.querySelectorAll<HTMLElement>(".waterfall-fill");
    const expected = [100,68,62,56,47,35,32,25,19,19,19];
    expect(fills).toHaveLength(expected.length);
    fills.forEach((fill,index) => expect(parseFloat(fill.style.width)).toBeCloseTo(expected[index]!));
  });
  it("renders an empty cohort without invalid bar dimensions", () => {
    const empty: Result = {...result,patients:[],counts:{total:0,passing:0,failing:0,unresolved:0},waterfall:{denominator:0,order:[],steps:[]}};
    render(<EligibilityWaterfall result={empty}/>);
    expect(screen.getByText("0 patients → 0 eligible")).toBeVisible();
    expect(screen.getByRole("figure").querySelector<HTMLElement>(".waterfall-fill")!.style.width).toBe("0%");
  });
});


describe("side-by-side eligibility waterfalls", () => {
  it("compares the same criterion on one scale and follows the selected scenario", () => {
    const {rerender} = render(<EligibilityWaterfallComparison baseline={result} scenario={combined.result as unknown as Result} scenarioTitle="Age 80 + up to 3 prior regimens"/>);
    const chart = screen.getByRole("figure",{name:"Draft and selected scenario eligibility waterfalls"});
    expect(within(chart).getByRole("listitem",{name:"Age at assessment: draft 68 meeting criteria, selected 85"})).toHaveTextContent("18–75 years → 18–80 years");
    expect(within(chart).getByRole("listitem",{name:"Prior systemic anticancer regimens: draft 25 meeting criteria, selected 43"})).toHaveTextContent("≤ 2 prior systemic regimens → ≤ 3 prior systemic regimens");
    expect(chart.querySelectorAll('[data-changed="true"]')).toHaveLength(2);
    const finalRow = within(chart).getByRole("listitem",{name:"CNS metastases: draft 19 meeting criteria, selected 37"});
    const widths = Array.from(finalRow.querySelectorAll<HTMLElement>(".waterfall-fill"),fill => parseFloat(fill.style.width));
    expect(widths).toEqual([19,37]);
    rerender(<EligibilityWaterfallComparison baseline={result} scenario={ageOnly.result as unknown as Result} scenarioTitle="Age limit: 75 → 80 years"/>);
    expect(within(chart).getAllByText("29 eligible")).toHaveLength(2);
    expect(within(chart).queryByText("37 eligible")).not.toBeInTheDocument();
    expect(chart.querySelectorAll('[data-changed="true"]')).toHaveLength(1);
  });
});
