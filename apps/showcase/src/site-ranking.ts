import type { SiteEvidence, SiteStudy } from "@kitsa/eligibility-lab-client";
import recorded from "../../../evidence/site-planning.json";
import regional from "../../../evidence/regional-context.json";
export { regional };
export const POOL_ID = "global-nsclc-six-campuses/1";
export const POLICY_VERSION = "nsclc-site-planning/1";
export const SPONSOR = "AstraZeneca";
export const SPONSOR_ALIASES = ["AstraZeneca", "AstraZeneca AB", "AstraZeneca Pharmaceuticals LP", "AstraZeneca UK Limited"];
export const FACTORS = ["experience", "activity", "competition", "sponsor", "burden", "population"] as const;
export type Factor = typeof FACTORS[number];
export type Weights = Record<Factor, number>;
export const DEFAULT_WEIGHTS: Weights = { experience:30, activity:20, competition:20, sponsor:15, burden:10, population:5 };
export const LABELS: Record<Factor,string> = {experience:"Relevant experience",activity:"Balance of ongoing work",competition:"Potential competition",sponsor:"Previous sponsor involvement",burden:"Regional disease burden",population:"Population age range"};
export const recordedSites = recorded.sites as SiteEvidence[];
export type Interval = [number, number];
export interface FactorResult { score: Interval; contribution: Interval; raw: string; known: boolean; study_ids: string[]; questions: string[]; sources: string[]; }
export interface Ranking { evidence: SiteEvidence; factors: Record<Factor,FactorResult>; score: Interval; provisional: boolean; weights: Weights; minAge: number; maxAge: number; }
export const normal = (s: string) => s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
export const sponsorMatches = (s: string | null) => s !== null && SPONSOR_ALIASES.some(a => normal(a) === normal(s));
export const experienceScore = (n: number) => n === Infinity ? 100 : 100*n/(n+5);
export const sponsorScore = (n: number) => n === Infinity ? 100 : 100*n/(n+3);
export const competitionScore = (n: number) => 100/(1+n);
export const activityScore = (share: number) => share < .2 ? share*500 : share <= .5 ? 100 : 200*(1-share);
export function normalizeWeights(weights: Weights): Weights {
  if (FACTORS.some(f => !Number.isFinite(weights[f]) || weights[f] < 0 || weights[f] > 100)) throw new Error("Each priority must be between 0 and 100.");
  const total = FACTORS.reduce((sum,f)=>sum+weights[f],0);
  if (!total) throw new Error("Keep at least one priority above zero.");
  return Object.fromEntries(FACTORS.map(f=>[f,100*weights[f]/total])) as Weights;
}
// Partial registry dates are intervals. A month spanning a cutoff stays uncertain.
export function dateRange(value: string | null): [string,string] | null {
  if (!value || !/^\d{4}(-\d{2}){0,2}$/.test(value)) return null;
  const [y,m,d] = value.split("-").map(Number);
  const start = `${y}-${String(m ?? 1).padStart(2,"0")}-${String(d ?? 1).padStart(2,"0")}`;
  const end = `${y}-${String(m ?? 12).padStart(2,"0")}-${String(d ?? new Date(Date.UTC(y!,m ?? 12,0)).getUTCDate()).padStart(2,"0")}`;
  return Number.isNaN(Date.parse(start)) || new Date(start).toISOString().slice(0,10)!==start ? null : [start,end];
}
function inWindow(value: string | null, low: string, high: string): boolean | null {
  const r=dateRange(value); return !r ? null : r[1]<low || r[0]>high ? false : r[0]>=low && r[1]<=high ? true : null;
}
function relevant(s: SiteStudy): boolean | null {
  const text=normal(s.conditions.join(" "));
  if (/non small cell|nsclc|lung adenocarcinoma|adenocarcinoma of (the )?lung|squamous cell lung/.test(text)) return true;
  return !s.conditions.length || /lung cancer|lung carcinoma|lung neoplasm/.test(text) ? null : false;
}
function age(value: string | null, upper: boolean): number | null {
  if (value === "N/A") return upper ? Infinity : 0;
  if (!value) return null;
  const m=/^(\d+(?:\.\d+)?)\s+(Years?|Months?|Weeks?|Days?)$/i.exec(value);
  if (!m) return null;
  return Number(m[1]) / (/year/i.test(m[2]!) ? 1 : /month/i.test(m[2]!) ? 12 : /week/i.test(m[2]!) ? 52.1775 : 365.25);
}
const ONGOING = new Set(["RECRUITING","NOT_YET_RECRUITING","ACTIVE_NOT_RECRUITING","ENROLLING_BY_INVITATION","SUSPENDED"]);
const CLOSED = new Set(["COMPLETED","TERMINATED","WITHDRAWN"]);
const rangeText = (lo:number, hi:number) => hi===lo ? String(lo) : Number.isFinite(hi) ? `${lo} to ${hi}` : `at least ${lo}`;
export function rankSite(evidence: SiteEvidence, rawWeights: Weights, minAge: number, maxAge: number): Ranking {
  if (!Number.isInteger(minAge) || !Number.isInteger(maxAge) || minAge<0 || maxAge>120 || minAge>maxAge) throw new Error("The planning age range must be within 0 to 120 years.");
  const weights=normalizeWeights(rawWeights), asOf=evidence.retrieved_at.slice(0,10), cutoff=`${Number(asOf.slice(0,4))-5}${asOf.slice(4)}`;
  const unique=[...new Map(evidence.studies.map(s=>[s.trial_id,s])).values()];
  const ambiguous=new Set(evidence.registry.exclusions.filter(e=>e.reason!=="other_campus").map(e=>e.trial_id)).size;
  const invalid=evidence.registry.exclusions.some(e=>e.reason==="invalid_record");
  const missing=evidence.registry.pagination_complete && !invalid ? ambiguous : Infinity;
  const counts={experience:0,activity:0,competition:0,sponsor:0}, uncertain={experience:missing,activity:missing,competition:missing,sponsor:missing};
  const ids: Record<keyof typeof counts,string[]>={experience:[],activity:[],competition:[],sponsor:[]};
  const issues=new Set<string>(); let proxies=0;
  if (!evidence.registry.pagination_complete) issues.add("Registry pagination is incomplete; additional studies may change these counts.");
  if (invalid) issues.add("Malformed registry records prevent a bounded count; their identities cannot be assumed to be duplicates.");
  if (ambiguous) issues.add(`${ambiguous} records have uncertain campus matches or invalid fields and remain excluded from verified counts.`);
  function add(f:keyof typeof counts, state:boolean|null, id:string) { if(state===true){counts[f]++;ids[f].push(id);}else if(state===null){uncertain[f]++;issues.add("Some relevant study dates, conditions, ages or statuses are missing or ambiguous.");} }
  for(const s of unique){
    const started=inWindow(s.start_date,"0000-01-01",asOf);
    add("sponsor",s.lead_sponsor===null ? (started===false?false:null) : sponsorMatches(s.lead_sponsor) ? started : false,s.trial_id);
    const rel=relevant(s);
    if(rel===false || (s.study_type!==null && s.study_type!=="INTERVENTIONAL"))continue;
    const status=s.status_source==="facility" ? s.facility_status : s.status_source==="study_proxy" ? s.overall_status : null;
    if(s.status_source==="study_proxy")proxies++;
    const certain=rel===true && s.study_type==="INTERVENTIONAL";
    const completed=s.overall_status==="COMPLETED" ? inWindow(s.completion_date,cutoff,asOf) : s.overall_status ? false : null;
    add("experience",completed===false ? false : certain ? completed : null,s.trial_id);
    const active=status && ONGOING.has(status) ? true : status && CLOSED.has(status) ? false : null;
    add("activity",active===false ? false : certain ? active : null,s.trial_id);
    if(status && status!=="RECRUITING" && (ONGOING.has(status)||CLOSED.has(status)))continue;
    if(sponsorMatches(s.lead_sponsor))continue;
    const lo=age(s.minimum_age,false),hi=age(s.maximum_age,true);
    if((lo!==null && lo>maxAge)||(hi!==null && hi<minAge))continue;
    add("competition",certain && status==="RECRUITING" && s.lead_sponsor!==null && lo!==null && hi!==null ? true : null,s.trial_id);
  }
  if(proxies)issues.add(`${proxies} relevant records use overall study status as a proxy because facility status is unavailable.`);
  const H=counts.experience,A=counts.activity,C=counts.competition,S=counts.sponsor;
  const Hmax=H+uncertain.experience,Amax=A+uncertain.activity;
  let activity: Interval=[0,100];
  if(A+H>0 && Number.isFinite(Amax+Hmax)){
    const lo=A/(A+Hmax),hi=Amax/(Amax+H),values=[activityScore(lo),activityScore(hi)];
    activity=[Math.min(...values),lo<=.5&&hi>=.2 ? 100 : Math.max(...values)];
  }
  const country=regional.countries[evidence.pin.country_code as keyof typeof regional.countries];
  const rates=Object.values(regional.countries).map(c=>c.incidence_per_100k);
  const percentile=country ? 100*(rates.filter(r=>r<country.incidence_per_100k).length+(rates.filter(r=>r===country.incidence_per_100k).length-1)/2)/(rates.length-1) : null;
  const share=country ? 100*Object.entries(country.population_by_age).reduce((n,[a,p])=>n+(Number(a)>=minAge&&Number(a)<=maxAge&&Number(a)<100?p:0),0)/country.population_total : null;
  const shareUpper=share!==null&&country&&maxAge>=100 ? share+100*country.population_by_age["100"]/country.population_total : share;
  const source=["https://clinicaltrials.gov/data-api/api"];
  function factor(f:Factor,score:Interval,raw:string,study_ids:string[]=[],questions:string[]=[],sources=source):FactorResult {
    return {score,contribution:score.map(n=>n*weights[f]/100) as Interval,raw,known:score[0]===score[1],study_ids,questions,sources};
  }
  const questions=[...issues];
  const factors:Record<Factor,FactorResult>={
    experience:factor("experience",[experienceScore(H),experienceScore(Hmax)],`${rangeText(H,Hmax)} completed relevant studies from ${cutoff} to ${asOf}.`,ids.experience,questions),
    activity:factor("activity",activity,`${rangeText(A,Amax)} ongoing and ${rangeText(H,Hmax)} recently completed relevant studies.`,ids.activity,A+H===0?[...questions,"No verified activity history supports a balance calculation."]:questions),
    competition:factor("competition",[competitionScore(C+uncertain.competition),competitionScore(C)],`${rangeText(C,C+uncertain.competition)} other-sponsor recruiting studies overlap ages ${minAge} to ${maxAge}.`,ids.competition,questions),
    sponsor:factor("sponsor",[sponsorScore(S),sponsorScore(S+uncertain.sponsor)],`${rangeText(S,S+uncertain.sponsor)} previously started studies name AstraZeneca as lead sponsor.`,ids.sponsor,questions),
    burden:factor("burden",percentile===null?[0,100]:[percentile,percentile],country ? `${country.incidence_per_100k.toFixed(1)} estimated new lung-cancer cases per 100,000 people in 2024 (${country.name}).` : "Country incidence is unknown.",[],country?[]:["Country incidence is unavailable."],country?[country.incidence_source]:[]),
    population:factor("population",share===null?[0,100]:[share,shareUpper!],share===null?"Population age distribution is unknown.":`${formatScore([share,shareUpper!])}% of the country's projected 2024 population is aged ${minAge} to ${maxAge}.`,[],share===null?["Single-year age data is unavailable."]:[],[regional.population_source]),
  };
  const score:Interval=[0,0];FACTORS.forEach(f=>{score[0]+=factors[f].contribution[0];score[1]+=factors[f].contribution[1];});
  return {evidence,factors,score,provisional:score[1]-score[0]>.000001,weights,minAge,maxAge};
}
export function rankSites(evidence:SiteEvidence[],weights:Weights,minAge:number,maxAge:number) {
  return evidence.map(e=>rankSite(e,weights,minAge,maxAge)).sort((a,b)=>b.score[0]-a.score[0] || (a.score[1]-a.score[0])-(b.score[1]-b.score[0]) || a.evidence.pin.site_id.localeCompare(b.evidence.pin.site_id));
}
export const formatScore = (r:Interval) => Math.abs(r[0]-r[1])<.000001 ? r[0].toFixed(1) : `${r[0].toFixed(1)}–${r[1].toFixed(1)}`;
