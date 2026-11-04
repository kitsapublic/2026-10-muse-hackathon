import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteEvidence } from "@kitsa/eligibility-lab-client";
import { fakeClient } from "./fake-client";
import { useSitePlanning } from "./Sites";
import { recordedSites } from "./site-ranking";
beforeEach(()=>sessionStorage.clear());
describe("site review context and live retrieval",()=>{
 it("restores review on reload, invalidates changes, and clears selections for a new baseline",()=>{
  const {client}=fakeClient();const fetch=vi.spyOn(client,"getSiteEvidence");
  const h=renderHook(({base,scenario,age})=>useSitePlanning(client,base,scenario,18,age),{initialProps:{base:"base1",scenario:"ab",age:80}});
  act(()=>h.result.current.toggle(recordedSites[0]!.pin.site_id));act(()=>h.result.current.confirm());expect(h.result.current.reviewed).toBe(true);
  const exported=h.result.current.exportPlan();expect(exported.selected_sites).toHaveLength(1);expect(exported.age_range.maximum).toBe(80);
  h.rerender({base:"base1",scenario:"b",age:75});expect(h.result.current.reviewed).toBe(false);expect(()=>h.result.current.exportPlan()).toThrow(/Review/);
  h.rerender({base:"base1",scenario:"ab",age:80});expect(h.result.current.reviewed).toBe(true);
  h.unmount();const reload=renderHook(()=>useSitePlanning(client,"base1","ab",18,80));expect(reload.result.current.reviewed).toBe(true);reload.unmount();
  const next=renderHook(()=>useSitePlanning(client,"base2","ab",18,80));expect(next.result.current.config.selected).toEqual([]);expect(fetch).not.toHaveBeenCalled();
 });
 it("ignores stale refresh responses after a scenario change and prevents duplicate refresh clicks",async()=>{
  const resolvers:((e:SiteEvidence)=>void)[]=[];
  const {client}=fakeClient({getSiteEvidence:vi.fn(()=>new Promise<SiteEvidence>(resolve=>resolvers.push(resolve)))});
  const h=renderHook(({scenario})=>useSitePlanning(client,"base",scenario,18,80),{initialProps:{scenario:"a"}});
  let pending:Promise<void>;act(()=>{pending=h.result.current.refresh();void h.result.current.refresh();});expect(client.getSiteEvidence).toHaveBeenCalledTimes(2);
  h.rerender({scenario:"ab"});await act(async()=>{resolvers.forEach((resolve,i)=>resolve(recordedSites[i]!));await pending;});
  expect(Object.keys(h.result.current.live)).toHaveLength(0);expect(h.result.current.progress).toBeNull();
 });
 it("retains recorded evidence and surfaces failures without relabelling it as fresh",async()=>{
  const {client}=fakeClient({getSiteEvidence:vi.fn().mockRejectedValue(new Error("Rate limited"))});
  const h=renderHook(()=>useSitePlanning(client,"base","ab",18,80));await act(()=>h.result.current.refresh());
  expect(Object.keys(h.result.current.errors)).toHaveLength(6);expect(Object.keys(h.result.current.live)).toHaveLength(0);
  expect(h.result.current.rankings.every(r=>recordedSites.some(e=>e.content_sha256===r.evidence.content_sha256))).toBe(true);
 });
 it("retains successful live evidence through remount without another request",async()=>{
  const get=vi.fn(async(id:string)=>structuredClone(recordedSites.find(e=>e.pin.site_id===id)!));
  const {client}=fakeClient({getSiteEvidence:get});
  const h=renderHook(()=>useSitePlanning(client,"base","ab",18,80));await act(()=>h.result.current.refresh());
  expect(Object.keys(h.result.current.live)).toHaveLength(6);h.unmount();
  const reload=renderHook(()=>useSitePlanning(client,"base","ab",18,80));
  expect(Object.keys(reload.result.current.live)).toHaveLength(6);expect(get).toHaveBeenCalledTimes(6);
 });
 it("discards malformed retained evidence without breaking the walkthrough",()=>{
  sessionStorage.setItem("kitsa/site-evidence-session/1",JSON.stringify({[recordedSites[0]!.pin.site_id]:{...recordedSites[0],studies:[null]}}));
  const {client}=fakeClient();const h=renderHook(()=>useSitePlanning(client,"base","ab",18,80));
  expect(Object.keys(h.result.current.live)).toHaveLength(0);expect(h.result.current.rankings).toHaveLength(6);
 });

});
