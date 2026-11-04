import { ErrorNotice } from "@kitsa/eligibility-ui";
import { useLoad } from "./hooks";

/** Historical public proposals are read-only evidence, never inserted into current selections. */
export function RawProposals() {
  const loaded = useLoad(() => import("../../../evidence/model-interpretations.json").then(m => m.default), []);
  return <div className="raw-proposals"><p>Muse proposed these criterion interpretations on 28 October 2026. They remain pending review and were not used as the rules for the measured baseline. You can review current proposals in Explore.</p>
    {loaded.error ? <ErrorNotice error={loaded.error}/> : null}
    {loaded.loading && <p role="status">Loading retained proposals…</p>}
    {loaded.data?.map(proposal => <details key={proposal.proposal_id}><summary>{proposal.criterion_id} · Pending review</summary><p>{proposal.criterion.text}</p><pre>{JSON.stringify({interpretation:proposal.interpretation,questions:proposal.questions},null,2)}</pre></details>)}
  </div>;
}
