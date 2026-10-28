import type { CriterionView, Proposal } from "@kitsa/eligibility-lab-client";
import { RuleView } from "./RuleView";

const ORIGINS: Record<Proposal["origin"], string> = {
  reference: "Authored reference interpretation",
  model: "Model proposal",
  edit: "Local edit",
};

export function reviewState(proposal: Proposal | undefined): "approved" | "rejected" | "pending" {
  return proposal?.review?.decision ?? "pending";
}

export interface CriterionReviewProps {
  criteria: readonly CriterionView[];
  proposals: readonly Proposal[];
  questions: Record<string, string>;
  /** The proposal shown for each criterion. */
  selection: Record<string, string>;
  onSelect: (criterionId: string, proposalId: string) => void;
  onReview: (proposal: Proposal, decision: "approved" | "rejected") => void;
  /** The proposal whose review is being saved. */
  busy?: string | null;
}

export function CriterionReview({ criteria, proposals, questions, selection, onSelect, onReview, busy }:
  CriterionReviewProps) {
  return (
    <ol className="elab-review">
      {criteria.map((criterion) => {
        const options = proposals.filter((p) => p.criterion_id === criterion.criterion_id);
        const proposal = options.find((p) => p.proposal_id === selection[criterion.criterion_id]) ?? options[0];
        const state = reviewState(proposal);
        const headingId = `elab-criterion-${criterion.criterion_id}`;
        return (
          <li key={criterion.criterion_id} className="elab-review__item" aria-labelledby={headingId}>
            <div className="elab-review__source">
              <h3 id={headingId} className="elab-review__heading">
                <span className="elab-review__anchor">{criterion.anchor}</span>{" "}
                {criterion.category === "inclusion" ? "Inclusion" : "Exclusion"} {criterion.criterion_id}
              </h3>
              <blockquote className="elab-review__text">{criterion.text}</blockquote>
            </div>
            <div className="elab-review__interpretation">
              {options.length > 1 && (
                <fieldset className="elab-review__choices">
                  <legend>Interpretation to review</legend>
                  {options.map((option) => (
                    <label key={option.proposal_id}>
                      <input
                        type="radio"
                        name={`proposal-${criterion.criterion_id}`}
                        checked={option.proposal_id === proposal?.proposal_id}
                        onChange={() => onSelect(criterion.criterion_id, option.proposal_id)}
                      />{" "}
                      {ORIGINS[option.origin]} ({reviewState(option)})
                    </label>
                  ))}
                </fieldset>
              )}
              {proposal ? (
                <>
                  <p className="elab-review__origin" data-origin={proposal.origin}>
                    {ORIGINS[proposal.origin]}
                    {proposal.origin === "model" ? ` from ${proposal.interpreter.name ?? "a model"}` : ""}
                  </p>
                  {proposal.valid ? (
                    <RuleView interpretation={proposal.interpretation} questions={{ ...questions, ...proposal.questions }} />
                  ) : (
                    <div className="elab-review__invalid" role="note">
                      <p>The engine refused this interpretation:</p>
                      <ul>
                        {proposal.problems.map((problem) => (
                          <li key={problem}>{problem}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="elab-review__decision">
                    <p className="elab-review__state" data-state={state}>
                      {state === "approved" ? "Approved" : state === "rejected" ? "Rejected" : "Awaiting review"}
                      {proposal.review ? ` by ${proposal.review.reviewer}` : ""}
                    </p>
                    <button
                      type="button"
                      className="elab-button"
                      disabled={!proposal.valid || state === "approved" || busy === proposal.proposal_id}
                      aria-describedby={headingId}
                      onClick={() => onReview(proposal, "approved")}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="elab-button elab-button--quiet"
                      disabled={state === "rejected" || busy === proposal.proposal_id}
                      aria-describedby={headingId}
                      onClick={() => onReview(proposal, "rejected")}
                    >
                      Reject
                    </button>
                  </div>
                </>
              ) : (
                <p>No interpretation has been proposed.</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
