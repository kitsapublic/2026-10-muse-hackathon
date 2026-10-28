import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ComparisonView,
  CriterionReview,
  DecisionMatrix,
  ModeChooser,
  PatientWaterfall,
  patientSteps,
  ScenarioControls,
} from "./index";
import { comparison, proposal, result } from "./test-data";

const criteria = { I1: { anchor: "5.1.1", category: "inclusion" }, E1: { anchor: "5.2.1", category: "exclusion" } };

describe("patient waterfall", () => {
  it("draws one strip per step that reproduces the engine's counts", () => {
    const steps = patientSteps(result());
    expect(steps?.strips.map((strip) => strip.map((cell) => `${cell.patientId}:${cell.status}`))).toEqual([
      ["P1:passing", "P3:passing", "P2:failing"],
      ["P1:passing", "P3:unresolved", "P2:failing"],
    ]);
    render(<PatientWaterfall result={result()} criteria={criteria} />);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(document.querySelectorAll(".elab-strip")).toHaveLength(2);
  });

  it("shows only the engine's counts when a strip would disagree with them", () => {
    const disagreeing = result();
    disagreeing.waterfall.steps[0]!.failing = 2;
    expect(patientSteps(disagreeing)).toBeNull();
    render(<PatientWaterfall result={disagreeing} criteria={criteria} />);
    expect(document.querySelectorAll(".elab-strip")).toHaveLength(0);
    expect(screen.getByRole("columnheader", { name: "Newly failing" })).toBeInTheDocument();
  });
});

describe("interpretation review", () => {
  const view = [{ criterion_id: "I1", category: "inclusion" as const, text: "Age 18 to 75.", anchor: "5.1.1" }];

  it("shows the source text and readable rule, and approves the shown proposal", async () => {
    const onReview = vi.fn();
    render(<CriterionReview criteria={view} proposals={[proposal()]} questions={{}} selection={{}}
                            onSelect={vi.fn()} onReview={onReview} />);
    expect(screen.getByText("Age 18 to 75.")).toBeInTheDocument();
    expect(screen.getByText(/adjustable from 18 to 100/)).toBeInTheDocument();
    expect(screen.getByText("Authored reference interpretation")).toBeInTheDocument();
    expect(screen.getByText("Awaiting review")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ proposal_id: "prp-1" }), "approved");
  });

  it("never offers approval of an interpretation the engine refused", () => {
    render(<CriterionReview criteria={view} questions={{}} selection={{}} onSelect={vi.fn()} onReview={vi.fn()}
                            proposals={[proposal({ valid: false, problems: ["requirement.op: unknown operator"] })]} />);
    expect(screen.getByText("requirement.op: unknown operator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("lets the reviewer choose between a reference and a model proposal", async () => {
    const onSelect = vi.fn();
    const model = proposal({ proposal_id: "prp-2", origin: "model",
                             interpreter: { kind: "model", name: "meta/muse-spark-1.3", version: "x" } });
    render(<CriterionReview criteria={view} proposals={[proposal(), model]} questions={{}} selection={{ I1: "prp-2" }}
                            onSelect={onSelect} onReview={vi.fn()} />);
    expect(screen.getByText("Model proposal from meta/muse-spark-1.3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Authored reference interpretation/ }));
    expect(onSelect).toHaveBeenCalledWith("I1", "prp-1");
  });
});

describe("modes", () => {
  it("keeps unavailable modes visible, disabled and explained", () => {
    render(<ModeChooser value="reference" onChange={vi.fn()} modes={{
      reference: { available: true, reason: null, label: "" },
      recorded: { available: false, reason: "No genuine model responses have been retained yet.", label: "" },
      live: { available: false, reason: "Live mode is disabled.", label: "" },
    }} />);
    expect(screen.getByRole("radio", { name: /Recorded model/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Live model/ })).toBeDisabled();
    expect(screen.getByText("No genuine model responses have been retained yet.")).toBeInTheDocument();
  });
});

describe("decision matrix", () => {
  it("colours cells from the engine's lists and explains a patient's decisions", async () => {
    render(<DecisionMatrix result={result()} />);
    const p2 = screen.getByRole("row", { name: /P2/ });
    expect(within(p2).getByText("No").closest("td")).toHaveAttribute("data-status", "failing");
    expect(within(p2).getByText("Undetermined").closest("td")).toHaveAttribute("data-status", "unresolved");
    const p3 = screen.getByRole("row", { name: /P3/ });
    expect(within(p3).getByText("Not evaluated")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "P1" }));
    expect(screen.getByRole("heading", { name: "P1: Meets every criterion" })).toBeInTheDocument();
    expect(screen.getByText("model narrative answer")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Fails a criterion" }));
    expect(screen.queryByRole("row", { name: /P1/ })).not.toBeInTheDocument();
  });
});

describe("scenario controls", () => {
  const parameters = [
    { criterion_id: "I1", parameter: "age_max", type: "integer" as const, value: 75, minimum: 18, maximum: 100 },
    { criterion_id: "I7", parameter: "max_regimens", type: "integer" as const, value: 2, minimum: 0, maximum: 10 },
  ];
  const presets = [{ scenario_id: "scenario-a", title: "Raise the upper age limit", author: "t",
                     edits: [{ criterion_id: "I1", parameter: "age_max", value: 80 }] }];
  const labels = { "I1.age_max": "Upper age limit", "I7.max_regimens": "Maximum prior regimens" };

  it("offers only the permitted parameters and submits only what changed", async () => {
    const onRun = vi.fn();
    render(<ScenarioControls parameters={parameters} presets={presets} labels={labels} onRun={onRun} />);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Run scenario" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Raise the upper age limit/ }));
    await userEvent.click(screen.getByRole("button", { name: "Run scenario" }));
    expect(onRun).toHaveBeenLastCalledWith([{ criterion_id: "I1", parameter: "age_max", value: 80 }], "scenario-a");
    const regimens = screen.getByRole("spinbutton", { name: "Maximum prior regimens" });
    await userEvent.clear(regimens);
    await userEvent.type(regimens, "3");
    await userEvent.click(screen.getByRole("button", { name: "Run scenario" }));
    expect(onRun).toHaveBeenLastCalledWith([{ criterion_id: "I1", parameter: "age_max", value: 80 },
                                            { criterion_id: "I7", parameter: "max_regimens", value: 3 }], null);
  });

  it("refuses values outside the permitted range before anything is sent", async () => {
    const onRun = vi.fn();
    render(<ScenarioControls parameters={parameters} presets={[]} labels={labels} onRun={onRun} />);
    const age = screen.getByRole("spinbutton", { name: "Upper age limit" });
    await userEvent.clear(age);
    await userEvent.type(age, "101");
    expect(screen.getByRole("alert")).toHaveTextContent("Upper age limit");
    expect(screen.getByRole("button", { name: "Run scenario" })).toBeDisabled();
    expect(onRun).not.toHaveBeenCalled();
  });
});

describe("comparison", () => {
  it("shows the change, the transitions and the changed patients", () => {
    const after = result({
      patients: result().patients.map((p) => (p.patient_id === "P2"
        ? { ...p, classification: "unresolved" as const, failing_criteria: [] } : p)),
      counts: { passing: 1, failing: 0, unresolved: 2, total: 3 },
      waterfall: { order: ["I1", "E1"], denominator: 3, steps: [
        { criterion_id: "I1", passing: 3, failing: 0, unresolved: 0, newly_failing: 0 },
        { criterion_id: "E1", passing: 1, failing: 0, unresolved: 2, newly_failing: 0 }] },
    });
    render(<ComparisonView comparison={comparison} baseline={result()} scenario={after} />);
    expect(screen.getByText(/meet every criterion at baseline/)).toHaveTextContent("1 meet every criterion at baseline");
    const failingRow = screen.getByRole("row", { name: /^Fails a criterion/ });
    expect(within(failingRow).getAllByRole("cell").map((c) => c.textContent)).toEqual(["0", "1", "0"]);
    expect(screen.getByRole("rowheader", { name: "P2" })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-marked="true"]').length).toBe(2);
  });
});
