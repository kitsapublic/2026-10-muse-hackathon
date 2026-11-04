import { type EligibilityLabClient, type Job, type PatientResult, type Result, TERMINAL_STATES } from "@kitsa/eligibility-lab-client";
import { ErrorNotice, JobStatus, ModeBadge, ModeChooser, reviewState } from "@kitsa/eligibility-ui";
import { useEffect, useRef, useState } from "react";
import { TechnicalSection } from "./TechnicalSection";
import { EligibilityWaterfall, EligibilityWaterfallComparison } from "./EligibilityWaterfall";
import { PatientHistory } from "./PatientHistory";
import { Benchmark } from "./Benchmark";
import { MuseEvidence, PatientEvidence, RunMetrics } from "./Evidence";
import { criterionName } from "./clinical-copy";
import { RawProposals } from "./RawProposals";
import { Explore } from "./Explore";
import { useLoad } from "./hooks";
import { SCENES, interactionGroups, isStoryBundle, reviewDocument, saveJson, scenarioNames, sceneIndex, source, statusLabels } from "./story";
import { useWorkflow, type Workflow } from "./useWorkflow";
import museMark from "./assets/muse-mark.svg";
import "./story.css";

function Outcomes({ result, baseline }: { result: Result; baseline?: Result }) {
  return <dl className="outcomes" aria-label="Cohort outcomes">{(["passing", "failing", "unresolved"] as const).map((kind) =>
    <div key={kind} data-classification={kind}><dt>{statusLabels[kind]}</dt><dd>{result.counts[kind]}<small> / {result.counts.total}</small></dd>
      {baseline && <span>{result.counts[kind] - baseline.counts[kind] >= 0 ? "+" : ""}{result.counts[kind] - baseline.counts[kind]} from baseline</span>}</div>)}</dl>;
}

function Controls({ flow, job }: { flow: Workflow; job: Job | null }) {
  if (!job) return null;
  return <><JobStatus job={job} title={job.kind === "baseline" ? "Cohort screening" : "Scenario evaluation"} busy={flow.busy !== null}
    onCancel={() => flow.control(job, "cancel")} onResume={() => flow.control(job, "resume")} resumeDisabled={job.mode === "live" && job.kind !== "scenario" && !flow.spendConfirmed} />
    {job.mode === "live" && TERMINAL_STATES.includes(job.state) && job.progress.failed + job.progress.ambiguous > 0 && <button className="elab-button elab-button--quiet"
      disabled={!flow.spendConfirmed || flow.busy !== null} onClick={() => flow.retryFailed(job)}>Retry {job.progress.failed + job.progress.ambiguous} failed or ambiguous requests</button>}
  </>;
}

function RunSetup({ flow }: { flow: Workflow }) {
  const { session, mode, setMode, spendConfirmed, setSpendConfirmed, liveExperiment } = flow;
  return <div className="run-setup">
    {session.data && <ModeChooser modes={session.data.modes} value={mode} onChange={setMode} disabled={flow.busy !== null} />}
    {!session.data?.modes.recorded.available && !flow.url.mode && <div className="story-empty"><p>This installation has no recorded model responses. You can choose the authored reference answers to try the screening workflow.</p>
      <button className="elab-button elab-button--quiet" onClick={() => setMode("reference")}>Use reference answers</button></div>}
    {mode === "live" && session.data?.modes.live.available && <label className="showcase__confirm"><input type="checkbox" checked={spendConfirmed} onChange={(e) => setSpendConfirmed(e.currentTarget.checked)} /> Allow model requests that spend from experiment {liveExperiment}, within its ceiling</label>}
    <p className="elab-muted">{flow.approved} of {flow.criteria.length} selected interpretations have been approved.
      {flow.proposals.data?.some((p) => p.origin !== "reference" && reviewState(p) !== "approved") ? " Muse’s proposed interpretations still need review before they can replace the reference rules." : " The recorded benchmark uses reviewed reference rules."}</p>
    {!flow.allApproved && <button className="elab-button elab-button--quiet" onClick={() => flow.setUrl({ view: "explore" })}>Review interpretations before screening</button>}
    {flow.errorFor("baseline")}
  </div>;
}

export function App({ client }: { client: EligibilityLabClient }) {
  const flow = useWorkflow(client);
  const { url, setUrl, detail, current, selectedScenario, compared, comparedResult, scenarioJobs } = flow;
  const index = sceneIndex(url.scene), scene = SCENES[index]!;
  const storyBundle = isStoryBundle(detail.data);
  const [showRaw, setShowRaw] = useState(false);
  const [preset, setPreset] = useState("scenario-a");
  const [inspector, setInspector] = useState<string | null>(null);
  const [exportError, setExportError] = useState<unknown>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const inspectorPanel = useRef<HTMLDivElement>(null);
  const previousScene = useRef(url.scene);
  useEffect(() => {
    if (previousScene.current !== url.scene) { title.current?.focus(); previousScene.current = url.scene; }
  }, [url.scene]);
  useEffect(() => { setInspector(null); setPreset("scenario-a"); setExportError(null); }, [flow.bundleKey, url.baseline]);
  const historical = useLoad((signal) => storyBundle && (scene.id === "muse" || inspector === "Muse request") && !current ? client.getJob(source.source_job_id, signal) : null,
    [client, storyBundle, scene.id, inspector, Boolean(current)]);
  const historyJob = historical.data?.bundle_key === flow.bundleKey && historical.data.mode === "live" ? historical.data : null;
  const activeScenario = selectedScenario.job?.baseline_job_id === current?.job.job_id && selectedScenario.job?.bundle_key === flow.bundleKey ? selectedScenario.job : null;
  useEffect(() => { if (activeScenario?.scenario?.scenario_id) setPreset(activeScenario.scenario.scenario_id); }, [activeScenario?.job_id]);
  const anchorRecord = useLoad(signal => storyBundle && scene.id === "muse" && flow.bundleKey ? client.getPatient(flow.bundleKey, source.anchor_patient_id) : null, [client, storyBundle, scene.id, flow.bundleKey]);
  const result = index >= 3 && comparedResult ? comparedResult : current?.result;
  const activeJob = index >= 3 && activeScenario ? activeScenario : current?.job ?? flow.baseline.job;
  const patientId = url.patient ?? (storyBundle ? source.anchor_patient_id : result?.patients[0]?.patient_id ?? null);
  const patient = useLoad((signal) => flow.bundleKey && patientId && (inspector === "Patient evidence") ? client.getPatient(flow.bundleKey, patientId) : null,
    [client, flow.bundleKey, patientId, inspector]);
  useEffect(() => { if (inspector === "Patient evidence" && patient.data) inspectorPanel.current?.scrollIntoView?.({ block: "start" }); }, [inspector, patientId, patient.data]);
  const decision = result?.patients.find((p) => p.patient_id === patientId);
  const report = useLoad((signal) => inspector === "Execution" && activeJob ? client.getReport(activeJob.job_id, signal) : null,
    [client, inspector, activeJob?.job_id, activeJob?.result?.content_digest, activeJob?.state]);
  const presets = detail.data?.scenarios ?? [];
  const latest = (id: string) => [...scenarioJobs].sort((a,b) => b.created_at.localeCompare(a.created_at)).find((j) => j.scenario?.scenario_id === id && j.state === "succeeded" && j.result?.coverage_complete);
  const three = [latest("scenario-a"), latest("scenario-b"), latest("scenario-ab")];
  const interaction = useLoad(async (signal) => {
    if (scene.id !== "evidence" || !current || !storyBundle || three.some((j) => !j)) return null;
    const loaded = await Promise.all(three.map((j) => client.getResult(j!.job_id, signal)));
    if (loaded.some((r) => r.job.baseline_job_id !== current.job.job_id)) return null;
    return interactionGroups(current.result, loaded[0]!.result, loaded[1]!.result, loaded[2]!.result);
  }, [client, scene.id, storyBundle, current?.job.job_id, ...three.map((j) => j?.job_id)]);
  const canRun = flow.allApproved && flow.busy === null && Boolean(flow.session.data?.modes[flow.mode].available) &&
    (Boolean(url.mode) || Boolean(flow.session.data?.modes.recorded.available)) && (flow.mode !== "live" || flow.spendConfirmed);
  const running = flow.baseline.job && !TERMINAL_STATES.includes(flow.baseline.job.state);
  function go(next: number) { setUrl({ scene: SCENES[next]!.id }); }
  function inspectPatient(p: PatientResult) { setUrl({ patient: p.patient_id }); setInspector("Patient evidence"); }
  async function exportReview() {
    setExportError(null);
    try {
      if (!detail.data || !current || !compared || !comparedResult || !activeScenario) throw new Error("Select a completed scenario before exporting.");
      const document = reviewDocument(detail.data, current, { job: activeScenario, result: comparedResult }, compared, id => {
        const links = flow.downloads(id);
        return {report:new URL(links.report,window.location.href).href,matrix:new URL(links.matrix,window.location.href).href,comparison:new URL(links.comparison,window.location.href).href};
      });
      saveJson(document, "eligibility-protocol-review-" + activeScenario.job_id + ".json");
    } catch (error) { setExportError(error); }
  }
  const eligibleToContinue = index < 2 || (index === 2 ? Boolean(current) : index === 3 ? Boolean(comparedResult) : true);
  return <div className="elab story-app">
    <a className="showcase__skip" href="#main">Skip to the story</a>
    <header className="story-bar"><a className="story-brand" href="?scene=question" onClick={(e) => { e.preventDefault(); setUrl({ scene: "question", view: null }); }}>Simulate Clinical Trials</a>
      <span className="story-bar__tag"><img src={museMark} alt="" width="28" height="28" />Built with Muse Spark</span>
      <button className="view-toggle" onClick={() => setUrl({ view: url.view === "explore" ? null : "explore" })}>{url.view === "explore" ? "← Guided story" : "Explore the lab ↗"}</button></header>
    {url.view === "explore" ? <Explore flow={flow} /> : <div className="story-layout">
      <aside className="story-rail"><p className="eyebrow">A five-minute walkthrough</p><nav aria-label="Story progress"><ol>{SCENES.map((s, i) => <li key={s.id}><button aria-current={index === i ? "step" : undefined} onClick={() => go(i)}><span>{String(i+1).padStart(2,"0")}</span>{s.label}</button></li>)}</ol></nav>
        <div className="rail-context"><span className="eyebrow">This installation</span><p>{detail.data?.cohort.patients ?? "—"} synthetic patients</p><ModeBadge mode={flow.baseline.job?.mode ?? flow.mode} /><p className="rail-note">{(flow.baseline.job?.mode ?? flow.mode) === "recorded" ? "This mode reuses recorded answers without making new model calls." : (flow.baseline.job?.mode ?? flow.mode) === "reference" ? "This mode uses authored reference answers without making model calls." : "Live calls require spending consent."}</p></div>
      </aside>
      <main id="main" className="story-main">
        <div className="story-heading"><p className="eyebrow">Step {index + 1} of {SCENES.length}</p><h1 tabIndex={-1} ref={title}>{scene.title}</h1></div>
        {flow.loadingProblem || flow.comparison.error || selectedScenario.error ? <ErrorNotice error={flow.loadingProblem ?? flow.comparison.error ?? selectedScenario.error} /> : null}
        {!detail.data && !flow.loadingProblem && <p role="status">Loading the installed protocol…</p>}
        {detail.data && <div className="scene" key={scene.id}>
          {scene.id === "question" && <>
            <section className="opening-vision opening-vision--compact" aria-label="The ambition: faster access to new medicines">
              <p className="eyebrow">Before the first patient is recruited</p>
              <h2>What if we could bring new medicines to patients in half the time?</h2>
              <p>Bringing a new medicine from discovery to market can take <strong>10–15 years</strong>. A clinical trial cannot finish without enough eligible participants.</p>
            </section>
            <div className="protocol-decision"><div><span className="eyebrow">The problem · Recruitment</span><h2>Finding the patients the protocol requires.</h2><p>Recruitment starts with a decision made much earlier: who is allowed to participate? Criteria carried forward from precedent or expert judgment can exclude the very population the treatment is intended to serve. By the time recruitment begins, those criteria are already part of the approved protocol.</p></div>
              <div><span className="eyebrow">Our approach · Protocol authoring</span><h2>Test eligibility criteria while writing the protocol.</h2><p>This application lets medical writers and clinical teams simulate eligibility against patient EHR data, compare different thresholds, and identify the largest scientifically appropriate target population before the protocol is finalized.</p></div></div>
            <p className="optimization-goal"><strong>The goal:</strong> maximize the eligible population while preserving the trial’s scientific purpose and safety requirements. Use real-world evidence to inform the criteria before recruitment begins.</p>
            <section className="trial-card protocol-draft"><span className="eyebrow">Trial in focus · {storyBundle ? "Illustrative protocol" : detail.data.protocol.protocol_id}</span><h2>{storyBundle ? "An open-label, single-arm study of ELX-101 in adults with advanced non-small-cell lung cancer" : detail.data.protocol.title}</h2>
              <p>The medical writer has drafted the following eligibility criteria. We will test them against the target population, then compare alternative age and prior-treatment limits.</p>
              <div className="criteria-columns">{(["inclusion", "exclusion"] as const).map(category => <div key={category}><h3>{category === "inclusion" ? "Inclusion criteria — all must be met" : "Exclusion criteria — any one excludes"}</h3><ol>{detail.data!.criteria.filter(c => c.category === category).map(c => <li key={c.criterion_id}><strong>{criterionName(c)}</strong><p>{c.text}</p></li>)}</ol></div>)}</div>
            </section>
            <div className="opening-grid"><section className="trial-card"><span className="eyebrow">The population we simulate</span><h2>Assume these {detail.data.cohort.patients} patients represent our target population.</h2><p>Each patient has a longitudinal electronic health record (EHR): data recorded across visits, investigations and treatments. This hackathon sample is synthetic.</p><p>A real EHR combines structured demographics, diagnoses, medications, vital signs and laboratory results with unstructured clinical notes, imaging reports and treatment histories. This demo evaluates the available age, cancer diagnosis and stage, performance status, blood counts, treatment history and clinical notes.</p><p>The intended real-world workflow applies the same criteria to EHR data across millions of patients, so protocol decisions reflect the population that sites will actually recruit from.</p>
              <dl className="trial-facts"><div><dt>Patients in the sample</dt><dd>{detail.data.cohort.patients}</dd></div><div><dt>Eligibility criteria</dt><dd>{detail.data.criteria.length}</dd></div></dl></section>
              <article className="anchor-card"><span className="eyebrow">A patient the draft excludes</span><h2>{storyBundle ? "Patient 011" : "Patient eligibility"}</h2>
                {storyBundle ? <><dl><div><dt>Age</dt><dd>78 years</dd></div><div><dt>Prior systemic regimens</dt><dd>3</dd></div><div><dt>Draft limits</dt><dd>Age ≤75; regimens ≤2</dd></div></dl><p>Patient 011 meets the other eight criteria. Two draft thresholds exclude her. We will test whether changing those thresholds makes her eligible, and how many other patients are affected.</p></> : <p>Evaluate the draft criteria to inspect the reasons each patient is included or excluded.</p>}
              </article></div>
            <details className="story-caption"><summary>Sources and demonstration context</summary><p><a href="https://www.gao.gov/blog/could-ai-help-create-new-medicines" target="_blank" rel="noreferrer">U.S. GAO: 10–15 years from discovery to market</a>. <a href="https://www.asco.org/research-data/clinical-trials/clinical-trial-eligibility-criteria" target="_blank" rel="noreferrer">ASCO: modernizing restrictive eligibility criteria</a>. Halving development time is the opening ambition. The measured result in this demo is the change in eligible patients under different criteria. The protocol and patient sample are synthetic.</p></details>
          </>}
          {scene.id === "muse" && <>
            <p className="story-lede">An electronic health record (EHR) contains both structured data—such as age, diagnoses, medications, vital signs and laboratory results—and unstructured data, such as clinical notes, imaging reports and treatment narratives. The Muse-powered application reads both to establish patient facts, connect them to their source evidence, and evaluate every inclusion and exclusion criterion.</p>
            {anchorRecord.data && <PatientHistory record={anchorRecord.data} />}{anchorRecord.error ? <ErrorNotice error={anchorRecord.error} /> : null}
            <p className="method-note">An unnecessarily restrictive threshold can exclude an otherwise suitable patient. Finding that mismatch during protocol authoring lets the clinical team assess a better threshold before the trial launches.</p>
            <MuseEvidence client={client} job={current?.job ?? historyJob} patientId={storyBundle ? source.anchor_patient_id : patientId} historical={!current} />
            {historical.error ? <p className="elab-muted">The original run is unavailable in this installation, but you can still review its aggregate measurements in Check the evidence.</p> : null}
            <p className="evidence-limit">The benchmark used reviewed reference rules. Muse also proposed interpretations of the criteria, and those proposals still require human review.</p>{storyBundle && <><button className="elab-link" aria-expanded={showRaw} onClick={() => setShowRaw(!showRaw)}>{showRaw ? "Hide" : "Inspect"} original pending criterion proposals</button>{showRaw && <RawProposals />}</>}
          </>}
          {scene.id === "baseline" && <>
            <p className="story-lede">Apply every draft inclusion and exclusion criterion to the population sample. A patient is eligible only when all inclusion criteria are met and no exclusion criterion applies. This baseline shows the population available under the draft protocol and exactly which criteria exclude everyone else.</p>
            {!current && <RunSetup flow={flow} />}
            {flow.baseline.error ? <ErrorNotice error={flow.baseline.error} /> : null}
            {current?.job.mode === "live" && flow.session.data?.modes.live.available && <label className="showcase__confirm"><input type="checkbox" checked={flow.spendConfirmed} onChange={e => flow.setSpendConfirmed(e.currentTarget.checked)} /> Allow recovery requests within experiment {flow.liveExperiment}. Retries are new requests; ambiguous attempts may already have been billed.</label>}
            <Controls flow={flow} job={flow.baseline.job} />
            {current && <><Outcomes result={current.result} /><div className="cohort-section"><div><h2>Eligibility, patient by patient.</h2><p>Every square represents one patient. Select it to see their EHR evidence, each criterion’s full wording, and the reason they match or fail.</p>
              <div className="grid-legend">{Object.entries(statusLabels).map(([key,label]) => <span key={key} data-classification={key}>{label}</span>)}</div>
              <button className="elab-button elab-button--quiet" onClick={() => { const unresolved = current.result.patients.find((p) => p.classification === "unresolved"); if (unresolved) inspectPatient(unresolved); }} disabled={!current.result.counts.unresolved}>Inspect unresolved eligibility</button></div>
              <div className="cohort-grid" aria-label="Patient cohort">{current.result.patients.map((p) => <button key={p.patient_id} data-classification={p.classification} aria-pressed={patientId === p.patient_id} onClick={() => inspectPatient(p)} title={p.patient_id + " · " + statusLabels[p.classification]} aria-label={p.patient_id + ": " + statusLabels[p.classification]}><span className="showcase__hidden">{p.patient_id}</span>{p.patient_id === source.anchor_patient_id ? "★" : p.classification === "unresolved" ? "?" : p.classification === "passing" ? "✓" : "−"}</button>)}</div></div>
              <EligibilityWaterfall result={current.result} />
              <details className="new-run"><summary>Start a new baseline</summary><p>A new baseline starts a separate comparison, and previous runs remain available with their original results.</p><RunSetup flow={flow} /><button className="elab-button elab-button--quiet" disabled={!canRun || Boolean(running)} onClick={flow.runBaseline}>Run a new baseline</button></details></>}
          </>}
          {scene.id === "scenarios" && <>
            <p className="story-lede">Optimize two eligibility parameters in the draft protocol: the upper age limit and the maximum number of prior systemic anticancer regimens. Compare each change separately and together to find the largest eligible population among these options. The other eight criteria stay fixed; the clinical team assesses the scientific rationale for each proposed change.</p>
            {current ? <><div className="scenario-cards">{presets.map((p) => { const completed = latest(p.scenario_id); return <button className="scenario-card" key={p.scenario_id} aria-pressed={preset === p.scenario_id} onClick={() => { setPreset(p.scenario_id); if (completed) setUrl({ scenario: completed.job_id }); }}><span className="eyebrow">{p.scenario_id === "scenario-ab" ? "Combined change" : "Single change"}</span><h2>{scenarioNames[p.scenario_id] ?? p.title}</h2><p>{p.scenario_id === "scenario-a" ? "Age at eligibility assessment: 18–75 years → 18–80 years." : p.scenario_id === "scenario-b" ? "Maximum prior systemic anticancer regimens: 2 → 3." : "Test both parameters together: age 18–80 years and no more than 3 prior systemic anticancer regimens."}</p><strong>{completed?.result?.counts.passing ?? "—"}<small>{completed ? " eligible patients" : " ready to test"}</small></strong></button>; })}</div>
              <div className="scenario-action"><button className={latest(preset) ? "elab-button elab-button--quiet" : "elab-button"} disabled={flow.busy !== null || Boolean(activeScenario && !TERMINAL_STATES.includes(activeScenario.state))} onClick={() => { const existing = latest(preset); if (existing) setUrl({ scenario: existing.job_id }); else void flow.runScenario([], preset); }}>{latest(preset) ? "View selected result" : "Run selected scenario"}</button><p>The same patient population is re-evaluated against the new thresholds. Existing EHR interpretations are reused; the scenario needs no new model calls.</p></div>
              {flow.errorFor("scenario")}<Controls flow={flow} job={activeScenario} />
              {comparedResult && <><p className="eyebrow">Selected result · {activeScenario ? flow.scenarioTitle(activeScenario, detail.data) : ""}</p><Outcomes result={comparedResult} baseline={current.result} />{storyBundle && <div className="anchor-transition"><strong>{source.anchor_patient_id}</strong><span>{statusLabels[current.result.patients.find((p) => p.patient_id === source.anchor_patient_id)?.classification ?? "unresolved"]} →</span><strong>{statusLabels[comparedResult.patients.find((p) => p.patient_id === source.anchor_patient_id)?.classification ?? "unresolved"]}</strong><button className="elab-link" onClick={() => { setUrl({ patient: source.anchor_patient_id }); setInspector("Patient evidence"); }}>Compare this patient’s criteria</button></div>}<div className="cohort-section"><div><h2>Inspect eligibility under the selected criteria.</h2><p>Select any patient to compare the original and revised criteria against their EHR. The evidence table shows exactly which eligibility decisions changed.</p><div className="grid-legend">{Object.entries(statusLabels).map(([key,label]) => <span key={key} data-classification={key}>{label}</span>)}</div></div><div className="cohort-grid" aria-label="Patient cohort under selected criteria">{comparedResult.patients.map(p => <button key={p.patient_id} data-classification={p.classification} aria-pressed={patientId === p.patient_id} onClick={() => inspectPatient(p)} title={p.patient_id + " · " + statusLabels[p.classification]} aria-label={p.patient_id + ": " + statusLabels[p.classification]}>{p.patient_id === source.anchor_patient_id ? "★" : p.classification === "unresolved" ? "?" : p.classification === "passing" ? "✓" : "−"}</button>)}</div></div></>}
            </> : <MissingBaseline onGo={() => go(2)} />}
          </>}
          {scene.id === "evidence" && <>
            {current && comparedResult ? <div className="impact-story"><span className="eyebrow">Your selected scenario</span><h2>{current.result.counts.passing} → {comparedResult.counts.passing} eligible patients with the selected criteria.</h2><p>The selected criteria identify <strong>{comparedResult.counts.passing - current.result.counts.passing} additional eligible patients</strong> in the same population. Eligibility remains unresolved for <strong>{current.result.counts.unresolved} to {comparedResult.counts.unresolved}</strong> patients, before and after the change. Those patients have missing or conflicting evidence for at least one criterion and are counted separately.</p>
              <EligibilityWaterfallComparison baseline={current.result} scenario={comparedResult} scenarioTitle={activeScenario ? (scenarioNames[activeScenario.scenario?.scenario_id ?? ""] ?? flow.scenarioTitle(activeScenario, detail.data)) : "Selected criteria"} />
              {interaction.data ? <><h3>Why the combined age + prior-treatment change adds {interaction.data.ageOnly.length + interaction.data.regimenOnly.length + interaction.data.bothRequired.length + interaction.data.either.length} eligible patients</h3><div className="interaction-equation" aria-label="Patients newly qualifying with both changes"><span><b>{interaction.data.ageOnly.length}</b>need the age change</span><i>+</i><span><b>{interaction.data.regimenOnly.length}</b>need the treatment change</span><i>+</i><span><b>{interaction.data.bothRequired.length}</b>need both changes</span>{interaction.data.either.length > 0 && <><i>+</i><span><b>{interaction.data.either.length}</b>either change</span></>}</div></> : <p className="elab-muted">Complete all three preset scenarios to see which patients require both changes.</p>}
              {interaction.error ? <ErrorNotice error={interaction.error} /> : null}</div> : <p className="evidence-limit">Run a baseline and select a scenario to inspect your own impact. The measurements below are from the original live run.</p>}
            <Benchmark compact />
          </>}
          {scene.id === "review" && <>
            <p className="story-lede">Take the proposed eligibility criteria, population impact and supporting patient evidence into protocol review. Medical writers can see exactly which thresholds changed, how many patients become eligible and which clinical questions still require resolution.</p>
            {current && scenarioJobs.some((j) => j.result) ? <label className="review-select">Eligibility criteria for protocol review<select value={activeScenario?.job_id ?? ""} onChange={(e) => setUrl({ scenario: e.currentTarget.value })}><option value="" disabled>Select a scenario</option>{scenarioJobs.filter((j) => j.result).map((j) => <option key={j.job_id} value={j.job_id}>{flow.scenarioTitle(j, detail.data)} · {j.job_id.slice(-6)}</option>)}</select></label> : <MissingBaseline onGo={() => go(current ? 3 : 2)} />}
            {current && comparedResult && compared && <><Outcomes result={comparedResult} baseline={current.result} /><div className="review-grid"><article><span className="eyebrow">01 / Review the change</span><h3>{compared.comparison.scenario.title}</h3><ul>{compared.comparison.scenario.edits.map((edit) => <li key={edit.criterion_id+edit.parameter}>{criterionName(comparedResult.criteria.find(c => c.criterion_id === edit.criterion_id) ?? { text: edit.criterion_id })}: {edit.parameter.replaceAll("_"," ")} → {edit.value}</li>)}</ul><p>{compared.comparison.changed_patients.length} patients change classification or criterion decisions.</p></article><article><span className="eyebrow">02 / Resolve evidence</span><h3>{comparedResult.counts.unresolved} patients need follow-up</h3><p>The export lists each unresolved criterion and its missing, conflicting or failed evidence.</p><button className="elab-link" onClick={() => { const p = comparedResult.patients.find((p) => p.classification === "unresolved"); if (p) inspectPatient(p); }} disabled={!comparedResult.counts.unresolved}>Inspect an open question</button></article></div>
              <details><summary>Underlying run exports</summary><ul className="showcase__downloads"><li><a href={flow.downloads(current.job.job_id).report} download>Baseline report (JSON)</a></li><li><a href={flow.downloads(compared.job.job_id).report} download>Scenario report (JSON)</a></li><li><a href={flow.downloads(compared.job.job_id).matrix} download>Scenario decision matrix (CSV)</a></li><li><a href={flow.downloads(compared.job.job_id).comparison} download>Changed patients (CSV)</a></li></ul></details></>}
            <div className="future-card"><h2>Design the protocol around the population it must recruit.</h2><p>The workflow is simple: draft eligibility criteria, evaluate the target population, compare scientifically justified alternatives, and take the evidence into protocol review. The next implementation step is connecting approved real-world EHR datasets so teams can do this across millions of patients before the trial launches.</p><p>Better population fit at the design stage gives recruitment a stronger starting point—and puts the goal of faster trials and earlier access to treatment into the protocol itself.</p></div>
            {exportError ? <ErrorNotice error={exportError} /> : null}
          </>}
          <TechnicalSection scene={scene.id} result={result} />
        </div>}
        <footer className="scene-actions"><button className="elab-button elab-button--quiet" disabled={index === 0} onClick={() => go(index-1)}>← Back</button><span>{index + 1} of {SCENES.length}</span>
          {index === 2 && !current ? <button className="elab-button" disabled={!canRun || Boolean(running)} onClick={flow.runBaseline}>{flow.busy === "baseline" || running ? "Evaluating…" : "Evaluate eligibility"}</button> : index === SCENES.length - 1 ? <button className="elab-button" disabled={!current || !compared || !comparedResult} onClick={exportReview}>Export review package ↓</button> : <button className="elab-button" disabled={!eligibleToContinue || !detail.data} onClick={() => go(index + 1)}>{scene.next} →</button>}
        </footer>
        <section className="inspector" aria-label="Technical inspector"><div className="inspector-header"><span className="eyebrow">Inspect the evidence</span><div>{["Patient evidence", "Muse request", "Execution", "Evaluation"].map((tab) => <button key={tab} aria-expanded={inspector === tab} onClick={() => setInspector(inspector === tab ? null : tab)}>{tab}</button>)}</div></div>
          {inspector && <div className="inspector-body" ref={inspectorPanel}><div className="section-heading"><h2>{inspector}</h2><button className="elab-link" onClick={() => setInspector(null)}>Close inspector</button></div>
            {inspector === "Patient evidence" && <>{patient.error ? <ErrorNotice error={patient.error} /> : patient.loading ? <p role="status">Loading patient evidence…</p> : patient.data ? <PatientEvidence record={patient.data} decision={decision} criteria={result?.criteria ?? []} baselineDecision={activeScenario && result === comparedResult ? current?.result.patients.find(p => p.patient_id === patientId) : undefined} baselineCriteria={current?.result.criteria} /> : <p>Select a patient in the cohort.</p>}</>}
            {inspector === "Muse request" && <MuseEvidence client={client} job={activeJob ?? historyJob} patientId={patientId} historical={!activeJob} />}
            {inspector === "Execution" && <>{report.error ? <ErrorNotice error={report.error} /> : report.data ? <RunMetrics report={report.data} /> : <p>{activeJob ? "Loading execution report…" : "Run the baseline to inspect its execution."}</p>}</>}
            {inspector === "Evaluation" && <Benchmark />}
          </div>}
        </section>
      </main>
    </div>}
  </div>;
}
function MissingBaseline({ onGo }: { onGo: () => void }) { return <div className="story-empty"><p>Complete the baseline, then choose a scenario to continue.</p><button className="elab-button elab-button--quiet" onClick={onGo}>Return to the workflow</button></div>; }
