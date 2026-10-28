import type { ReactNode } from "react";

/** An interpretation in the engine's closed rule language, rendered as readable nested conditions. */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Node = { [key: string]: Json };
type Parameter = { type?: string; value?: Json; editable?: boolean; minimum?: Json; maximum?: Json };

const COMPARATORS: Record<string, string> = { lt: "<", le: "≤", gt: ">", ge: "≥" };
const CONCEPTS: Record<string, string> = {
  birth_date: "birth date",
  sex: "sex",
  nsclc_histology: "non-small-cell lung cancer histology",
  disease_stage: "disease stage",
  ecog: "ECOG performance status",
  neutrophils: "absolute neutrophil count",
  haemoglobin: "haemoglobin",
  systemic_anticancer_regimen: "systemic anticancer regimens",
  systemic_therapy_history_complete: "complete treatment-history review",
};

function concept(name: Json | undefined): string {
  return typeof name === "string" ? (CONCEPTS[name] ?? name.replaceAll("_", " ")) : String(name);
}

function windowText(days: Json | undefined): string {
  return typeof days === "number" ? `latest within ${days} days` : "latest on record";
}

function isNode(value: Json | undefined): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface Context {
  parameters: Record<string, Parameter>;
  questions: Record<string, string>;
}

function Value({ value, context }: { value: Json | undefined; context: Context }) {
  if (isNode(value) && typeof value.param === "string") {
    const parameter = context.parameters[value.param];
    return (
      <span className="elab-rule__param" data-editable={parameter?.editable ? "true" : undefined}>
        {String(parameter?.value ?? "?")}
        <span className="elab-rule__param-name">
          {" "}
          ({value.param}
          {parameter?.editable ? `, adjustable from ${String(parameter.minimum)} to ${String(parameter.maximum)}` : ""})
        </span>
      </span>
    );
  }
  return <span>{String(value)}</span>;
}

function leaf(node: Node, context: Context): ReactNode {
  const comparator = COMPARATORS[String(node.comparator)] ?? String(node.comparator);
  switch (node.op) {
    case "age":
      return (
        <>
          Age {comparator} <Value value={node.value} context={context} /> years
        </>
      );
    case "measurement":
      return (
        <>
          {concept(node.concept)} {comparator} <Value value={node.value} context={context} />
          {node.unit ? ` ${String(node.unit)}` : ""}, {windowText(node.window_days)}
        </>
      );
    case "code_in":
      return (
        <>
          {concept(node.concept)} is {Array.isArray(node.codes) ? node.codes.join(" or ") : ""},{" "}
          {windowText(node.window_days)}
        </>
      );
    case "assertion":
      return (
        <>
          {concept(node.concept)} recorded as present, {windowText(node.window_days)}
        </>
      );
    case "regimen_count":
    case "days_since_last_dose": {
      const history = isNode(node.history) ? node.history.window_days : null;
      return (
        <>
          {node.op === "regimen_count" ? "Prior systemic regimens" : "Days since the last dose"} {comparator}{" "}
          <Value value={node.value} context={context} />, established by a {concept("systemic_therapy_history_complete")}
          {typeof history === "number" ? ` within ${history} days` : ""}
        </>
      );
    }
    case "narrative": {
      const question = String(node.question);
      return (
        <>
          Notes from the last {String(node.window_days)} days establish: <q>{context.questions[question] ?? question}</q>
        </>
      );
    }
    default:
      return <>Unrecognized rule {JSON.stringify(node)}</>;
  }
}

function RuleNode({ node, context }: { node: Json | undefined; context: Context }) {
  if (!isNode(node)) return <span>Missing rule</span>;
  if ((node.op === "and" || node.op === "or") && Array.isArray(node.args)) {
    return (
      <div className="elab-rule__group">
        <span className="elab-rule__joiner">{node.op === "and" ? "All of" : "Any of"}</span>
        <ul>
          {node.args.map((arg, index) => (
            <li key={index}>
              <RuleNode node={arg} context={context} />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (node.op === "not") {
    return (
      <div className="elab-rule__group">
        <span className="elab-rule__joiner">Not</span>
        <ul>
          <li>
            <RuleNode node={node.arg} context={context} />
          </li>
        </ul>
      </div>
    );
  }
  return <span>{leaf(node, context)}</span>;
}

export interface RuleViewProps {
  interpretation: Record<string, unknown>;
  questions: Record<string, string>;
}

export function RuleView({ interpretation, questions }: RuleViewProps) {
  const rule = interpretation as Node;
  if (rule.status === "unsupported") {
    return <p className="elab-rule elab-rule--unsupported">Not executable: {String(rule.reason)}</p>;
  }
  const context: Context = {
    parameters: (isNode(rule.parameters) ? rule.parameters : {}) as Record<string, Parameter>,
    questions,
  };
  return (
    <div className="elab-rule">
      {rule.applicability !== null && rule.applicability !== undefined && (
        <div className="elab-rule__part">
          <span className="elab-rule__label">Applies when</span>
          <RuleNode node={rule.applicability} context={context} />
        </div>
      )}
      <div className="elab-rule__part">
        <span className="elab-rule__label">Requires</span>
        <RuleNode node={rule.requirement} context={context} />
      </div>
    </div>
  );
}
