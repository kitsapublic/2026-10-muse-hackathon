import { useEffect, useRef, useState } from "react";
import type { EligibilityLabClient, SiteEvidence } from "@kitsa/eligibility-lab-client";
import { DEFAULT_WEIGHTS, FACTORS, LABELS, POLICY_VERSION, POOL_ID, SPONSOR, SPONSOR_ALIASES, formatScore, normalizeWeights, rankSites, recordedSites, regional, type Ranking, type Weights } from "./site-ranking";

interface Settings { weights: Weights; selected: string[]; reviewed: string | null; }
const initial = ():Settings => ({weights:{...DEFAULT_WEIGHTS},selected:[],reviewed:null});
const CACHE_KEY="kitsa/site-evidence-session/1";
function settings(key:string,baseKey:string):Settings {
  try {const saved=sessionStorage.getItem(key);const s=JSON.parse(saved??sessionStorage.getItem(baseKey+"/latest")??"null");if(!s)return initial();normalizeWeights(s.weights);
    if(!Array.isArray(s.selected)||s.selected.some((id:unknown)=>typeof id!=="string"||!recordedSites.some(e=>e.pin.site_id===id)))return initial();
    return {weights:s.weights,selected:[...new Set<string>(s.selected)],reviewed:saved&&typeof s.reviewed==="string"?s.reviewed:null};
  }catch{return initial();}
}
function cached():Record<string,SiteEvidence> {
  try {const c=JSON.parse(sessionStorage.getItem(CACHE_KEY)??"{}");return Object.fromEntries(recordedSites.flatMap(e=>{
    const v=c[e.pin.site_id];
    if(!v||v.pool_id!==POOL_ID||v.pin?.site_id!==e.pin.site_id||v.pin.country_code!==e.pin.country_code||v.source_mode!=="live"||!Array.isArray(v.studies)||!Array.isArray(v.profile_fields)||!Array.isArray(v.registry?.exclusions)||!Number.isFinite(Date.parse(v.retrieved_at))||!/^[a-f0-9]{64}$/.test(v.content_sha256))return [];
    try{rankSites([v],DEFAULT_WEIGHTS,18,75);return [[e.pin.site_id,v]];}catch{return [];}
  }));}catch{return {};}
}
export function useSitePlanning(client:EligibilityLabClient, baselineKey:string|null, scenarioId:string|null, minAge:number,maxAge:number) {
  const baseKey=`kitsa/site-plan/1/${baselineKey??"unselected"}`;
  const key=baseKey+"/"+(scenarioId??"no-scenario");
  const [slot,setSlot]=useState(()=>({key,value:settings(key,baseKey)}));
  const [live,setLive]=useState<Record<string,SiteEvidence>>(cached);
  const [progress,setProgress]=useState<{done:number;total:number}|null>(null);
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [storageError,setStorageError]=useState(false);
  const operation=useRef<AbortController|null>(null);
  const context=useRef({key,scenarioId});context.current={key,scenarioId};
  const config=slot.key===key?slot.value:settings(key,baseKey);
  useEffect(()=>{setSlot({key,value:settings(key,baseKey)});setErrors({});},[key]);
  useEffect(()=>{operation.current?.abort();operation.current=null;setProgress(null);return()=>operation.current?.abort();},[key,scenarioId]);
  function change(value:Settings){setSlot({key,value});try{sessionStorage.setItem(key,JSON.stringify(value));sessionStorage.setItem(baseKey+"/latest",JSON.stringify(value));}catch{setStorageError(true);}}
  const evidence=recordedSites.map(e=>live[e.pin.site_id]??e);
  const rankings=rankSites(evidence,config.weights,minAge,maxAge);
  const signature=JSON.stringify({baselineKey,scenarioId,minAge,maxAge,weights:config.weights,selected:config.selected,evidence:evidence.map(e=>e.content_sha256)});
  const reviewed=config.selected.length>0&&config.reviewed===signature;
  async function refresh(){
    if(operation.current)return;
    const controller=new AbortController();operation.current=controller;setErrors({});setProgress({done:0,total:recordedSites.length});
    let cursor=0,done=0;
    const valid=()=>operation.current===controller&&!controller.signal.aborted&&context.current.key===key&&context.current.scenarioId===scenarioId;
    async function worker(){while(cursor<recordedSites.length&&valid()){
      const pin=recordedSites[cursor++]!.pin;
      try{const value=await client.getSiteEvidence(pin.site_id,controller.signal);
        if(!valid())return;
        if(value.pool_id!==POOL_ID||value.pin.site_id!==pin.site_id)throw new Error("The response has a different campus identity.");
        if(value.registry.error||value.profile_error)throw new Error(value.registry.error??value.profile_error??"Public evidence is unavailable.");
        setLive(previous=>{const next={...previous,[pin.site_id]:value};try{sessionStorage.setItem(CACHE_KEY,JSON.stringify(next));}catch{setStorageError(true);}return next;});
      }catch(error){if(valid())setErrors(prev=>({...prev,[pin.site_id]:error instanceof Error?error.message:"The public source could not be refreshed."}));}
      if(valid())setProgress({done:++done,total:recordedSites.length});
    }}
    await Promise.all([worker(),worker()]);if(valid()){operation.current=null;setProgress(null);}
  }
  function exportPlan(){
    if(!baselineKey||!scenarioId||!reviewed)throw new Error("Review the site shortlist for this scenario before exporting.");
    return {format:"kitsa/site-planning-review/1",pool_id:POOL_ID,policy_version:POLICY_VERSION,sponsor_preference:SPONSOR,sponsor_aliases:SPONSOR_ALIASES,
      baseline_context:baselineKey,scenario_job_id:scenarioId,age_range:{minimum:minAge,maximum:maxAge},weights:normalizeWeights(config.weights),regional_dataset:regional,
      ranking_rule:"Descending lower score bound; overlapping ranges do not establish a confident order. Ties favour narrower ranges, then the fixed site identifier.",
      candidate_pool:rankings.map(r=>({site_id:r.evidence.pin.site_id,score_range:r.score,provisional:r.provisional,evidence_timestamp:r.evidence.retrieved_at,evidence_sha256:r.evidence.content_sha256,factors:r.factors})),
      selected_sites:rankings.filter(r=>config.selected.includes(r.evidence.pin.site_id)).map(r=>({site_id:r.evidence.pin.site_id,score_range:r.score,factors:r.factors,evidence:r.evidence,playback:live[r.evidence.pin.site_id]?"live retrieval retained in this browser session":"recorded evidence"})),
      outstanding_questions:["Confirm each campus identity and the current status of the studies listed as uncertain.","Ask sites about staff capacity, recruitment performance and competing study catchments.","Confirm access to an approved patient dataset before estimating eligible patients at a site.","Review whether country-level incidence and population assumptions fit the intended recruitment region."],
      limitations:["These planning assumptions have not been validated as predictors of recruitment.","The synthetic records are not assigned to hospitals and do not represent recruited participants.","Public registries can be incomplete or out of date even when every query page has been retrieved."]};
  }
  return {rankings,config,reviewed,live,progress,errors,storageError,refresh,exportPlan,
    cancel:()=>{operation.current?.abort();operation.current=null;setProgress(null);},
    setWeights:(weights:Weights)=>{normalizeWeights(weights);change({...config,weights,reviewed:null});},
    toggle:(id:string)=>change({...config,selected:config.selected.includes(id)?config.selected.filter(s=>s!==id):[...config.selected,id],reviewed:null}),
    confirm:()=>change({...config,reviewed:signature})};
}
export type SitePlanning = ReturnType<typeof useSitePlanning>;
function Explanation({r}:{r:Ranking}){
  return <details className="site-explanation"><summary>See the evidence and score calculation</summary>
    <p>The score range retains uncertainty instead of assigning zero to missing evidence. Verified counts form the lower bound. Unmatched records can widen the upper bound; incomplete pagination leaves that bound open.</p>
    <div className="story-table-scroll" tabIndex={0} role="region" aria-label="Site evidence table"><table className="elab-table"><caption>Weighted contributions to this planning score</caption><thead><tr><th>Factor</th><th>Public evidence</th><th>Score / 100</th><th>Contribution</th></tr></thead><tbody>{FACTORS.map(f=><tr key={f}><th>{LABELS[f]}<small>{r.weights[f].toFixed(1)}% weight</small></th><td>{r.factors[f].raw}</td><td>{formatScore(r.factors[f].score)}{!r.factors[f].known&&<small>Provisional</small>}</td><td>{formatScore(r.factors[f].contribution)}</td></tr>)}</tbody></table></div>
    <p>The registry returned {r.evidence.registry.records_read} records across {r.evidence.registry.pages_read} pages; {r.evidence.studies.length} unique studies matched the pinned campus. Pagination is {r.evidence.registry.pagination_complete?"complete for the disclosed query":"incomplete"}.</p>
    <p>{r.evidence.pin.campus_qualification}</p>
    <ul>{[...new Set(FACTORS.flatMap(f=>r.factors[f].questions))].map(q=><li key={q}>{q}</li>)}</ul>
    <details><summary>Study evidence and excluded campus matches</summary>
      <p>Relevant experience and competition use interventional studies whose conditions explicitly describe non-small-cell lung cancer. Broad lung-cancer descriptions remain uncertain. This search does not measure the hospital’s entire workload.</p>
      <p className="elab-ids">{r.evidence.registry.query}</p>
      <div className="story-table-scroll" tabIndex={0} role="region" aria-label="Site evidence table"><table className="elab-table"><thead><tr><th>Study</th><th>Condition and lead sponsor</th><th>Status</th><th>Dates and age range</th></tr></thead><tbody>{r.evidence.studies.map(s=><tr key={s.trial_id}><th><a href={s.url} target="_blank" rel="noreferrer">{s.trial_id}</a><small>{s.title}</small></th><td>{s.conditions.join(", ")}<small>Lead sponsor: {s.lead_sponsor??"Unknown"}</small><small>Collaborators: {s.collaborators.join(", ")||"None listed"}</small></td><td>{(s.facility_status??s.overall_status??"Unknown").replaceAll("_"," ")}<small>{s.status_source==="study_proxy"?"Overall study status is a proxy.":s.status_source==="facility"?"Facility status is available.":"Facility status is uncertain."}</small></td><td>Started {s.start_date??"on an unknown date"}; completed {s.completion_date??"on an unknown date"}.<small>{s.minimum_age??"Unknown"} to {s.maximum_age??"unknown"}</small></td></tr>)}</tbody></table></div>
      <ul>{r.evidence.registry.exclusions.map((e,i)=><li key={e.trial_id+i}>{e.trial_id}: {e.reason.replaceAll("_"," ")}{e.facilities.length?`. ${e.facilities.join("; ")}`:""}</li>)}</ul>
    </details>
    <details><summary>Public profile and regional sources</summary><p><a href={r.evidence.profile_url} target="_blank" rel="noreferrer">Read the Kitsa public profile</a>. Its identifier is {r.evidence.pin.site_id}. The profile was last modified on {r.evidence.profile_modified_at?.slice(0,10)??"an unknown date"}.</p>
      <dl>{r.evidence.profile_fields.filter(f=>["name","website_url","city","state","country"].includes(f.id)).map(f=><div key={f.id}><dt>{f.label}</dt><dd>{String(f.value)}<small>{f.source}</small></dd></div>)}</dl>
      <p>{regional.scope} The reference is {regional.incidence_version}; population figures use {regional.population_version}.</p>
      <ul>{[...new Set(FACTORS.flatMap(f=>r.factors[f].sources))].map(url=><li key={url}><a href={url} target="_blank" rel="noreferrer">{url.includes("iarc")?"IARC country fact sheet":url.includes("population.un")?"UN single-year population data":"ClinicalTrials.gov API documentation"}</a></li>)}</ul>
    </details>
  </details>;
}
export function SiteShortlist({plan}:{plan:SitePlanning}){
 return <div className="shortlist-summary"><h2>Research sites shortlisted for the proposed eligibility criteria.</h2>{plan.config.selected.length?<ul>{plan.rankings.filter(r=>plan.config.selected.includes(r.evidence.pin.site_id)).map(r=><li key={r.evidence.pin.site_id}>{r.evidence.pin.name} in {r.evidence.pin.city}, {r.evidence.pin.country}, with a planning score of {formatScore(r.score)}.</li>)}</ul>:<p>Select the sites you want to investigate in the site-planning step.</p>}
 <p role="status">{plan.reviewed?"The shortlist has been reviewed for the selected scenario and priorities.":"The shortlist needs review before export. A changed scenario, priority or evidence source can change the ranking."}</p></div>;
}
export function Sites({plan,canReview}:{plan:SitePlanning;canReview:boolean}){
  const [all,setAll]=useState(false),[weightError,setWeightError]=useState<string|null>(null);
  return <div className="sites-scene"><p className="story-lede">With a target population defined, compare research sites with relevant disease experience. Kitsa provides the site profiles; trial registries provide study history. Rank these six candidates by NSCLC experience, ongoing trials, competing studies, sponsor history and regional demographics.</p>
    <p>Click a site’s name to open its Kitsa profile. The score helps prioritize feasibility discussions; patient availability and site capacity are confirmed with the site.</p>
    <details className="planning-policy"><summary>Adjust the planning priorities</summary>
      <p>These starting weights and response curves are planning assumptions. Nonzero weights are normalized to 100%, and an all-zero configuration is rejected. The sponsor preference in this policy is AstraZeneca.</p>
      <div className="weight-controls">{FACTORS.map(f=><label key={f}>{LABELS[f]}<span>{normalizeWeights(plan.config.weights)[f].toFixed(1)}%</span><input type="range" min="0" max="100" step="1" value={plan.config.weights[f]} onChange={e=>{try{plan.setWeights({...plan.config.weights,[f]:Number(e.currentTarget.value)});setWeightError(null);}catch(error){setWeightError((error as Error).message);}}}/></label>)}</div>
      {weightError&&<p role="alert">{weightError}</p>}
      <button className="elab-button elab-button--quiet" onClick={()=>{plan.setWeights({...DEFAULT_WEIGHTS});setWeightError(null);}}>Reset priorities</button>
      <details><summary>Read the response curves and evidence limits</summary><ul>
        <li>Experience scores completed interventional NSCLC studies from the preceding five years as 100 × H / (H + 5).</li>
        <li>Ongoing work is A / (A + H). Its score rises linearly from zero to 100 at a 20% share, stays at 100 through 50%, and falls linearly to zero at 100%. With no activity history, this factor remains unknown.</li>
        <li>Potential competition scores other-lead-sponsor recruiting NSCLC studies with overlapping ages as 100 / (1 + C). Eligibility details and recruitment catchments can still differ.</li>
        <li>Previous AstraZeneca involvement scores previously started studies as 100 × S / (S + 3). Collaborators do not count as lead sponsors. Recognized lead-sponsor names are {SPONSOR_ALIASES.join(", ")}.</li>
        <li>Disease burden uses the percentile rank of the crude annual lung-cancer incidence rate within this six-country pool. It includes all lung-cancer types and reflects differences in population age.</li>
        <li>Population age range uses the share of the country’s projected 2024 population within the trial’s selected age limits. Both regional factors remain fixed to the bundled 2024 data when site evidence refreshes.</li>
      </ul><p>Provisional candidates are ordered by their lower score bound. Overlapping ranges do not establish a confident order. A narrower range breaks ties, followed by the pinned site identifier.</p></details>
    </details>
    <div className="section-heading"><h2>{all?"Compare all six candidates.":"Start with these three candidates."}</h2><button className="elab-link" aria-expanded={all} onClick={()=>setAll(!all)}>{all?"Show top three":"Compare all six sites"}</button></div>
    <div className="site-cards">{plan.rankings.slice(0,all?6:3).map((r,i)=>{const id=r.evidence.pin.site_id;return <article className="site-card" key={id}>
      <div className="site-card-heading"><span className="site-order">{String(i+1).padStart(2,"0")}</span><div><h3><a href={r.evidence.profile_url} target="_blank" rel="noopener noreferrer" aria-label={`${r.evidence.pin.name} on Kitsa (opens in a new tab)`}>{r.evidence.pin.name}</a></h3><p>{r.evidence.pin.city}, {r.evidence.pin.country}</p></div><div className="planning-score"><strong>{formatScore(r.score)}</strong><span>Planning score / 100</span><small>{r.provisional?"Provisional range":"Calculated score"}</small></div></div>
      <p>The verified records include {r.factors.experience.study_ids.length} relevant studies completed in the preceding five years, and {r.factors.sponsor.study_ids.length} previously started studies name AstraZeneca as lead sponsor. {r.provisional && "Other records still need confirmation and widen the score range."}</p>
      <p className="elab-muted">{plan.live[id]?"Live retrieval retained in this session":"Recorded public evidence"}, retrieved {r.evidence.retrieved_at.slice(0,10)}.</p>
      {plan.errors[id]&&<p role="alert">The refresh failed. {plan.errors[id]} The evidence above retains its original date.</p>}
      <button className="elab-button elab-button--quiet" aria-pressed={plan.config.selected.includes(id)} onClick={()=>plan.toggle(id)}>{plan.config.selected.includes(id)?"Remove":"Add"} {r.evidence.pin.name} {plan.config.selected.includes(id)?"from":"to"} review</button>
      <Explanation r={r}/>
    </article>;})}</div>
    <details className="refresh-sites"><summary>Refresh the public site evidence</summary><p>This action requests public Kitsa profiles and registry records. It makes no model calls and sends no patient records. Regional reference data remains fixed.</p>
      <button className="elab-button elab-button--quiet" disabled={plan.progress!==null} onClick={()=>void plan.refresh()}>Refresh site evidence</button>
      {plan.progress&&<><p role="status">Retrieved {plan.progress.done} of {plan.progress.total} sites.</p><button className="elab-link" onClick={plan.cancel}>Cancel refresh</button></>}
      {!!Object.keys(plan.errors).length&&<p role="alert">{Object.keys(plan.errors).length} sites could not be refreshed. Each site retains its last available evidence and original timestamp.</p>}
    </details>
    {plan.storageError&&<p role="alert">This browser could not retain the settings or refreshed evidence. Reload will return to the recorded defaults.</p>}
    <SiteShortlist plan={plan}/>
    <button className="elab-button elab-button--quiet" disabled={!canReview||!plan.config.selected.length||plan.progress!==null||plan.reviewed} onClick={plan.confirm}>{plan.reviewed?"Shortlist reviewed":"Confirm shortlist for this scenario"}</button>
    {!canReview&&<p>Select a completed participation scenario before confirming the shortlist.</p>}
  </div>;
}
