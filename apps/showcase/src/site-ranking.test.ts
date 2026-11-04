import { describe, expect, it } from "vitest";
import type { SiteEvidence, SiteStudy } from "@kitsa/eligibility-lab-client";
import { DEFAULT_WEIGHTS, FACTORS, activityScore, competitionScore, dateRange, experienceScore, normalizeWeights, rankSite, rankSites, recordedSites, regional, sponsorMatches, sponsorScore } from "./site-ranking";
const study=(patch:Partial<SiteStudy>={}):SiteStudy=>({trial_id:"NCT00000001",title:"NSCLC study",url:"https://clinicaltrials.gov/study/NCT00000001",conditions:["Non-small Cell Lung Cancer"],study_type:"INTERVENTIONAL",overall_status:"COMPLETED",facility_status:"COMPLETED",status_source:"facility",start_date:"2022-03-01",completion_date:"2024-03-01",updated_on:"2026-10-01",lead_sponsor:"Other sponsor",collaborators:[],minimum_age:"18 Years",maximum_age:"N/A",matched_facilities:["Test site"],...patch});
const site=(studies:SiteStudy[]):SiteEvidence=>({...structuredClone(recordedSites[0]!),studies,registry:{...recordedSites[0]!.registry,exclusions:[],pagination_complete:true,matching_complete:true,error:null}});
describe("disclosed site planning policy",()=>{
 it("uses diminishing returns and penalizes both activity extremes and competition",()=>{
  expect(experienceScore(10)).toBeGreaterThan(experienceScore(5));expect(experienceScore(10)-experienceScore(5)).toBeLessThan(experienceScore(5));
  expect(activityScore(0)).toBe(0);expect(activityScore(.2)).toBe(100);expect(activityScore(.5)).toBe(100);expect(activityScore(1)).toBe(0);
  expect(competitionScore(3)).toBeLessThan(competitionScore(2));expect(sponsorScore(3)).toBe(50);
 });
 it("counts each study once and keeps collaborators out of sponsor history",()=>{
  const s=study({collaborators:["AstraZeneca"]}),r=rankSite(site([s,s]),DEFAULT_WEIGHTS,18,80);
  expect(r.factors.experience.study_ids).toEqual([s.trial_id]);expect(r.factors.sponsor.study_ids).toEqual([]);
  const known=rankSite(site([study({lead_sponsor:"AstraZeneca"})]),DEFAULT_WEIGHTS,18,80);
  expect(known.factors.sponsor.contribution[0]).toBeGreaterThan(r.factors.sponsor.contribution[0]);
  expect(sponsorMatches("AstraZeneca AB")).toBe(true);expect(sponsorMatches("Volastra Therapeutics")).toBe(false);
 });
 it("considers facility status and the actual age overlap for competition",()=>{
  const s=study({overall_status:"RECRUITING",facility_status:"COMPLETED",completion_date:null});
  expect(rankSite(site([s]),DEFAULT_WEIGHTS,18,75).factors.competition.score).toEqual([100,100]);
  const c=study({facility_status:"RECRUITING",overall_status:"RECRUITING",minimum_age:"78 Years"});
  expect(rankSite(site([c]),DEFAULT_WEIGHTS,18,75).factors.competition.study_ids).toHaveLength(0);
  expect(rankSite(site([c]),DEFAULT_WEIGHTS,18,80).factors.competition.study_ids).toHaveLength(1);
 });
 it("shows bounded uncertainty for missing dates, ambiguous matches and incomplete pagination",()=>{
  const s=site([study({completion_date:null})]);const r=rankSite(s,DEFAULT_WEIGHTS,18,75);
  expect(r.factors.experience.score[0]).toBe(0);expect(r.factors.experience.score[1]).toBeGreaterThan(0);expect(r.provisional).toBe(true);
  s.registry.exclusions=[{trial_id:"NCT00000002",reason:"ambiguous_facility",facilities:["Unknown branch"]}];
  const uncertain=rankSite(s,DEFAULT_WEIGHTS,18,75);expect(uncertain.factors.sponsor.score[1]).toBeGreaterThan(0);
  s.registry.exclusions=[{trial_id:"unknown",reason:"invalid_record",facilities:[]},{trial_id:"unknown",reason:"invalid_record",facilities:[]}];
  expect(rankSite(s,DEFAULT_WEIGHTS,18,75).factors.sponsor.score[1]).toBe(100);
  s.registry.pagination_complete=false;const incomplete=rankSite(s,DEFAULT_WEIGHTS,18,75);
  expect(incomplete.factors.experience.score[1]).toBe(100);expect(incomplete.factors.competition.score[0]).toBe(0);
 });
 it("retains partial dates as ranges and distinguishes unknown activity from zero activity",()=>{
  expect(dateRange("2024-02")).toEqual(["2024-02-01","2024-02-29"]);expect(dateRange("2024-02-31")).toBeNull();
  expect(rankSite(site([]),DEFAULT_WEIGHTS,18,75).factors.activity.score).toEqual([0,100]);
  expect(rankSite(site([study()]),DEFAULT_WEIGHTS,18,75).factors.activity.score).toEqual([0,0]);
 });
 it("normalizes priorities without redistributing missing factors and rejects all zero",()=>{
  const weights={...DEFAULT_WEIGHTS,experience:60};expect(Object.values(normalizeWeights(weights)).reduce((a,b)=>a+b,0)).toBeCloseTo(100);
  expect(()=>normalizeWeights(Object.fromEntries(FACTORS.map(f=>[f,0])) as typeof weights)).toThrow(/above zero/);
  const s=site([]);s.registry.pagination_complete=false;const r=rankSite(s,DEFAULT_WEIGHTS,18,75);
  expect(r.factors.experience.contribution).toEqual([0,30]);expect(r.weights.burden).toBe(10);
 });
 it("keeps regional years and country scope fixed while the age range changes",()=>{
  const a=rankSite(site([]),DEFAULT_WEIGHTS,18,75),b=rankSite(site([]),DEFAULT_WEIGHTS,18,80);
  expect(b.factors.population.score[0]).toBeGreaterThan(a.factors.population.score[0]);expect(b.factors.burden).toEqual(a.factors.burden);
  expect(regional.reference_year).toBe(2024);expect(regional.population_version).toContain("projection");
  expect(rankSite(site([]),DEFAULT_WEIGHTS,18,100).factors.population.known).toBe(false);
 });
 it("reproduces scores and explanations for the six versioned campus records",()=>{
  expect(new Set(recordedSites.map(e=>e.pin.site_id)).size).toBe(6);
  const a=rankSites(recordedSites,DEFAULT_WEIGHTS,18,80);expect(rankSites(recordedSites,DEFAULT_WEIGHTS,18,80)).toEqual(a);
  for(const r of a){expect(r.score[0]).toBeGreaterThanOrEqual(0);expect(r.score[1]).toBeLessThanOrEqual(100);expect(r.score[0]).toBeLessThanOrEqual(r.score[1]);}
 });
});
