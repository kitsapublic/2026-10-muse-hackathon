import { type EligibilityLabClient, type Job, type PatientResult, type Result, TERMINAL_STATES } from "@kitsa/eligibility-lab-client";
import { ErrorNotice, JobStatus, ModeBadge, ModeChooser } from "@kitsa/eligibility-ui";
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
  return <><JobStatus job={job} title={job.kind === "baseline" ? "Screening" : "Scenario evaluation"} busy={flow.busy !== null}
    onCancel={() => flow.control(job, "cancel")} onResume={() => flow.control(job, "resume")} resumeDisabled={job.mode === "live" && job.kind !== "scenario" && !flow.spendConfirmed} />
    {job.mode === "live" && TERMINAL_STATES.includes(job.state) && job.progress.failed + job.progress.ambiguous > 0 && <button className="elab-button elab-button--quiet"
      disabled={!flow.spendConfirmed || flow.busy !== null} onClick={() => flow.retryFailed(job)}>Retry {job.progress.failed + job.progress.ambiguous} failed or ambiguous requests</button>}
  </>;
}

function RunSetup({ flow }: { flow: Workflow }) {
  const { session, mode, setMode, spendConfirmed, setSpendConfirmed, liveExperiment } = flow;
  return <div className="run-setup">
    {session.data && <ModeChooser modes={session.data.modes} value={mode} onChange={setMode} disabled={flow.busy !== null} descriptions={{
      reference: session.data.modes.reference.available ? "Hand-written answers; no AI model involved." : undefined,
      recorded: session.data.modes.recorded.available ? (isStoryBundle(flow.detail.data) ? "Muse’s real answers from the 28 October run, replayed; no new model calls." : "Previously recorded model answers, replayed; no new model calls.") : undefined,
      live: session.data.modes.live.available ? "Ask Muse now." : "Ask Muse now (disabled in this installation).",
    }} />}
    {!session.data?.modes.recorded.available && !flow.url.mode && <div className="story-empty"><p>This installation has no recorded model responses. You can choose the authored reference answers to try the screening workflow.</p>
      <button className="elab-button elab-button--quiet" onClick={() => setMode("reference")}>Use reference answers</button></div>}
    {mode === "live" && session.data?.modes.live.available && <label className="showcase__confirm"><input type="checkbox" checked={spendConfirmed} onChange={(e) => setSpendConfirmed(e.currentTarget.checked)} /> Allow model requests that spend from experiment {liveExperiment}, within its ceiling</label>}
    <p className="elab-muted">{flow.allApproved ? `All ${flow.criteria.length} criterion interpretations have been reviewed and approved.` : `${flow.approved} of ${flow.criteria.length} criterion interpretations have been reviewed and approved.`}</p>
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
              <p className="eyebrow">Before a single patient is enrolled</p>
              <h2>What if we could bring new medicines to patients in half the time?</h2>
              <p>Bringing a new medicine from discovery to market takes <strong>10 to 15 years</strong>. Much of that time is spent in clinical trials, where the medicine is tested in people, and the most common reason trials run late is that the criteria for who can join were written in the lab without looking at real-world patient data. This application helps find the optimal eligibility criteria for a trial before it starts recruiting patients.</p>
            </section>
            <div className="protocol-decision"><div><span className="eyebrow">The problem · Finding patients</span><h2>Clinical trials are designed in the lab, without real-world patient data.</h2><p>A protocol’s eligibility criteria define who can join, including age and prior-treatment limits. Criteria copied from earlier trials or set by expert judgement may exclude the target population. Hospitals then struggle to enrol patients, and the trial runs late.</p></div>
              <div><span className="eyebrow">Our approach · Test the criteria first</span><h2>Test eligibility criteria before finalizing the protocol.</h2><p>Match draft criteria against patient health records. See who qualifies, which criteria exclude patients, and how revised limits affect the population. Medical writers can then choose scientifically sound criteria grounded in patient evidence.</p></div></div>
            <p className="optimization-goal"><strong>The goal:</strong> maximize the eligible population while preserving safety and scientific validity. Use patient evidence to remove unnecessary exclusions before recruitment begins.</p>
            <section className="trial-card protocol-draft"><span className="eyebrow">Trial in focus · {storyBundle ? "Fictional drug and patients" : detail.data.protocol.protocol_id}</span><h2>{storyBundle ? "An open-label, single-arm study of ELX-101 in adults with advanced non-small-cell lung cancer" : detail.data.protocol.title}</h2>
              <p>{storyBundle ? "This fictional lung-cancer study has eight inclusion and two exclusion criteria. Test them against 100 synthetic patient records, then compare higher age and prior-treatment limits." : "The medical writer has drafted the following eligibility criteria. We will test them against the target population, then compare alternative age and prior-treatment limits."}</p>
              <div className="criteria-columns">{(["inclusion", "exclusion"] as const).map(category => <div key={category}><h3>{category === "inclusion" ? (storyBundle ? "Inclusion criteria — all eight must be met" : "Inclusion criteria — a patient must meet all") : "Exclusion criteria — any one rules a patient out"}</h3><ol>{detail.data!.criteria.filter(c => c.category === category).map(c => <li key={c.criterion_id}><strong>{criterionName(c)}</strong><p>{c.text}</p></li>)}</ol></div>)}</div>
            </section>
            <div className="opening-grid"><section className="trial-card"><span className="eyebrow">The patients we test against</span><h2>Assume these {detail.data.cohort.patients} patients represent our target population.</h2><p>Electronic health records (EHRs) combine structured data, such as age, diagnoses, blood tests and treatment dates, with free-text clinic notes and scan reports.</p><p>These {detail.data.cohort.patients} records are synthetic; no real patient data is used. In practice, teams would test criteria against records from recruiting hospitals and clinics.</p>
              <dl className="trial-facts"><div><dt>Patients</dt><dd>{detail.data.cohort.patients}</dd></div><div><dt>Eligibility criteria</dt><dd>{detail.data.criteria.length}</dd></div></dl></section>
              <article className="anchor-card"><span className="eyebrow">One patient the draft excludes</span><h2>{storyBundle ? "Patient 011" : "Patient eligibility"}</h2>
                {storyBundle ? <><dl><div><dt>Age</dt><dd>78 years</dd></div><div><dt>Previous cancer treatments (regimens)</dt><dd>3</dd></div><div><dt>Draft limits</dt><dd>Age ≤75; no more than 2 regimens</dd></div></dl><p>She meets eight of the ten criteria but fails both draft limits. Test whether raising them makes her eligible, and how many other patients qualify.</p></> : <p>Evaluate the draft criteria to inspect the reasons each patient is included or excluded.</p>}
              </article></div>
            <details className="story-caption"><summary>Sources and demonstration context</summary><p><a href="https://www.gao.gov/blog/could-ai-help-create-new-medicines" target="_blank" rel="noreferrer">U.S. GAO: 10–15 years from discovery to market</a>. <a href="https://www.asco.org/research-data/clinical-trials/clinical-trial-eligibility-criteria" target="_blank" rel="noreferrer">ASCO: modernizing restrictive eligibility criteria</a>. Halving development time is the opening ambition. The measured result in this demo is the change in eligible patients under different criteria. The protocol and patient sample are synthetic.</p></details>
          </>}
          {scene.id === "muse" && <>
            <p className="story-lede">An electronic health record (EHR) holds two kinds of data: fixed fields, such as age, diagnoses and blood tests, and free-text clinic notes and scan reports. Muse reads the notes, establishes patient facts and cites their sources. The application combines those facts with the fixed fields to check every eligibility criterion.</p>
            {anchorRecord.data && <PatientHistory record={anchorRecord.data} />}{anchorRecord.error ? <ErrorNotice error={anchorRecord.error} /> : null}
            <p className="method-note">Identify unnecessary exclusions while the protocol is still being written.</p>
            <MuseEvidence client={client} job={current?.job ?? historyJob} patientId={storyBundle ? source.anchor_patient_id : patientId} historical={!current} />
            {historical.error ? <p className="elab-muted">The original run is unavailable in this installation, but you can still review its aggregate measurements in Check the evidence.</p> : null}
            <p className="evidence-limit">These results use reviewed reference rules. Muse’s own criterion proposals remain unreviewed.</p>{storyBundle && <><button className="elab-link" aria-expanded={showRaw} onClick={() => setShowRaw(!showRaw)}>{showRaw ? "Hide" : "Inspect"} Muse’s original criterion proposals</button>{showRaw && <RawProposals />}</>}
          </>}
          {scene.id === "baseline" && <>
            <p className="story-lede">Apply every draft criterion to all {detail.data.cohort.patients} patients. Eligible patients meet all inclusion criteria and no exclusion applies. Unresolved means evidence is missing, conflicting or could not be evaluated. The result is the baseline: the population the draft protocol would have to recruit from.</p>
            {!current && <RunSetup flow={flow} />}
            {flow.baseline.error ? <ErrorNotice error={flow.baseline.error} /> : null}
            {current?.job.mode === "live" && flow.session.data?.modes.live.available && <label className="showcase__confirm"><input type="checkbox" checked={flow.spendConfirmed} onChange={e => flow.setSpendConfirmed(e.currentTarget.checked)} /> Allow recovery requests within experiment {flow.liveExperiment}. Retries are new requests; ambiguous attempts may already have been billed.</label>}
            <Controls flow={flow} job={flow.baseline.job} />
            {current && <><Outcomes result={current.result} /><div className="cohort-section"><div><h2>Eligibility, patient by patient.</h2><p>Select a patient to see their evidence and each criterion’s decision.{storyBundle && " The star marks Patient 011."}</p>
              <div className="grid-legend">{Object.entries(statusLabels).map(([key,label]) => <span key={key} data-classification={key}>{label}</span>)}</div>
              <button className="elab-button elab-button--quiet" onClick={() => { const unresolved = current.result.patients.find((p) => p.classification === "unresolved"); if (unresolved) inspectPatient(unresolved); }} disabled={!current.result.counts.unresolved}>Inspect unresolved eligibility</button></div>
              <div className="cohort-grid" aria-label="Patient cohort">{current.result.patients.map((p) => <button key={p.patient_id} data-classification={p.classification} aria-pressed={patientId === p.patient_id} onClick={() => inspectPatient(p)} title={p.patient_id + " · " + statusLabels[p.classification]} aria-label={p.patient_id + ": " + statusLabels[p.classification]}><span className="showcase__hidden">{p.patient_id}</span>{p.patient_id === source.anchor_patient_id ? "★" : p.classification === "unresolved" ? "?" : p.classification === "passing" ? "✓" : "−"}</button>)}</div></div>
              <EligibilityWaterfall result={current.result} />
              <details className="new-run"><summary>Run screening again</summary><p>A new baseline starts a separate comparison, and previous runs remain available with their original results.</p><RunSetup flow={flow} /><button className="elab-button elab-button--quiet" disabled={!canRun || Boolean(running)} onClick={flow.runBaseline}>Run a new baseline</button></details></>}
          </>}
          {scene.id === "scenarios" && <>
            <p className="story-lede">The waterfall pointed at two limits: age and previous cancer treatments (prior systemic regimens). Test higher values for each, separately and together, with the other eight criteria fixed. The clinical team reviews whether each change is scientifically justified.</p>
            {current ? <><div className="scenario-cards">{presets.map((p) => { const completed = latest(p.scenario_id); return <button className="scenario-card" key={p.scenario_id} aria-pressed={preset === p.scenario_id} onClick={() => { setPreset(p.scenario_id); if (completed) setUrl({ scenario: completed.job_id }); }}><span className="eyebrow">{p.scenario_id === "scenario-ab" ? "Combined change" : "Single change"}</span><h2>{scenarioNames[p.scenario_id] ?? p.title}</h2><p>{p.scenario_id === "scenario-a" ? "Age range: 18–75 → 18–80 years." : p.scenario_id === "scenario-b" ? "Maximum previous cancer treatment regimens: 2 → 3." : "Age 18–80 and up to 3 previous cancer treatment regimens."}</p><strong>{completed?.result?.counts.passing ?? "—"}<small>{completed ? " eligible patients" : " ready to test"}</small></strong></button>; })}</div>
              <div className="scenario-action"><button className={latest(preset) ? "elab-button elab-button--quiet" : "elab-button"} disabled={flow.busy !== null || Boolean(activeScenario && !TERMINAL_STATES.includes(activeScenario.state))} onClick={() => { const existing = latest(preset); if (existing) setUrl({ scenario: existing.job_id }); else void flow.runScenario([], preset); }}>{latest(preset) ? "View selected result" : "Run selected scenario"}</button><p>Re-evaluate the same patients using existing clinical evidence. No new model calls are needed.</p></div>
              {flow.errorFor("scenario")}<Controls flow={flow} job={activeScenario} />
              {comparedResult && <><p className="eyebrow">Selected result · {activeScenario ? flow.scenarioTitle(activeScenario, detail.data) : ""}</p><Outcomes result={comparedResult} baseline={current.result} />{comparedResult.counts.unresolved > current.result.counts.unresolved && <p className="elab-muted">Some excluded patients now pass the revised limits but still need evidence for another criterion, so they become unresolved.</p>}{storyBundle && <div className="anchor-transition"><strong>Patient 011</strong><span>{statusLabels[current.result.patients.find((p) => p.patient_id === source.anchor_patient_id)?.classification ?? "unresolved"]} →</span><strong>{statusLabels[comparedResult.patients.find((p) => p.patient_id === source.anchor_patient_id)?.classification ?? "unresolved"]}</strong><button className="elab-link" onClick={() => { setUrl({ patient: source.anchor_patient_id }); setInspector("Patient evidence"); }}>Compare her criteria</button></div>}<div className="cohort-section"><div><h2>Inspect eligibility under the selected criteria.</h2><p>Select a patient to compare the draft and revised criteria, with evidence for each decision.</p><div className="grid-legend">{Object.entries(statusLabels).map(([key,label]) => <span key={key} data-classification={key}>{label}</span>)}</div></div><div className="cohort-grid" aria-label="Patient cohort under selected criteria">{comparedResult.patients.map(p => <button key={p.patient_id} data-classification={p.classification} aria-pressed={patientId === p.patient_id} onClick={() => inspectPatient(p)} title={p.patient_id + " · " + statusLabels[p.classification]} aria-label={p.patient_id + ": " + statusLabels[p.classification]}>{p.patient_id === source.anchor_patient_id ? "★" : p.classification === "unresolved" ? "?" : p.classification === "passing" ? "✓" : "−"}</button>)}</div></div></>}
            </> : <MissingBaseline onGo={() => go(2)} />}
          </>}
          {scene.id === "evidence" && <>
            {current && comparedResult ? <div className="impact-story"><span className="eyebrow">Your selected scenario</span><h2>{current.result.counts.passing} → {comparedResult.counts.passing} eligible patients with the selected criteria.</h2><p>{storyBundle && activeScenario?.scenario?.scenario_id === "scenario-ab" && current.result.counts.total === 100 && current.result.counts.passing === 19 && comparedResult.counts.passing === 37 ? <strong>Almost twice as many eligible patients from the same 100 records, by changing two numbers.</strong> : <><strong>{comparedResult.counts.passing - current.result.counts.passing} additional eligible patients</strong> in the same population.</>} Unresolved eligibility changes from <strong>{current.result.counts.unresolved} to {comparedResult.counts.unresolved}</strong>; these patients remain separate from those confirmed eligible.</p>
              <EligibilityWaterfallComparison baseline={current.result} scenario={comparedResult} scenarioTitle={activeScenario ? (scenarioNames[activeScenario.scenario?.scenario_id ?? ""] ?? flow.scenarioTitle(activeScenario, detail.data)) : "Selected criteria"} />
              {interaction.data ? <><h3>Why the combined age + prior-treatment change adds {interaction.data.ageOnly.length + interaction.data.regimenOnly.length + interaction.data.bothRequired.length + interaction.data.either.length} eligible patients</h3><div className="interaction-equation" aria-label="Patients newly qualifying with both changes"><span><b>{interaction.data.ageOnly.length}</b>need the age change</span><i>+</i><span><b>{interaction.data.regimenOnly.length}</b>need the treatment change</span><i>+</i><span><b>{interaction.data.bothRequired.length}</b>need both changes</span>{interaction.data.either.length > 0 && <><i>+</i><span><b>{interaction.data.either.length}</b>either change</span></>}</div>{interaction.data.bothRequired.includes(source.anchor_patient_id) && <p>Patient 011 is one of the {interaction.data.bothRequired.length === 4 ? "four" : interaction.data.bothRequired.length} who need both.</p>}</> : <p className="elab-muted">Run all three scenarios to see which patients need both changes.</p>}
              {interaction.error ? <ErrorNotice error={interaction.error} /> : null}</div> : <p className="evidence-limit">Run a baseline and select a scenario to inspect your own impact. The measurements below are from the original live run.</p>}
            <Benchmark compact />
          </>}
          {scene.id === "review" && <>
            <p className="story-lede">The clinical team reviews the proposed limits, population impact and supporting evidence before approving criteria for the final protocol.</p>
            {current && scenarioJobs.some((j) => j.result) ? <label className="review-select">Criteria to take into review<select value={activeScenario?.job_id ?? ""} onChange={(e) => setUrl({ scenario: e.currentTarget.value })}><option value="" disabled>Select a scenario</option>{scenarioJobs.filter((j) => j.result).map((j) => <option key={j.job_id} value={j.job_id} title={j.job_id}>{flow.scenarioTitle(j, detail.data)}</option>)}</select></label> : <MissingBaseline onGo={() => go(current ? 3 : 2)} />}
            {current && comparedResult && compared && <><Outcomes result={comparedResult} baseline={current.result} /><div className="review-grid"><article><span className="eyebrow">01 / Review the change</span><h3>{activeScenario ? flow.scenarioTitle(activeScenario, detail.data) : compared.comparison.scenario.title}</h3><ul>{compared.comparison.scenario.edits.map((edit) => <li key={edit.criterion_id+edit.parameter}>{criterionName(comparedResult.criteria.find(c => c.criterion_id === edit.criterion_id) ?? { text: edit.criterion_id })}: {current.result.criteria.find(c => c.criterion_id === edit.criterion_id)?.parameters[edit.parameter] ?? "—"} → {edit.value}</li>)}</ul><p>{compared.comparison.changed_patients.length} patients change status or a criterion decision.</p></article><article><span className="eyebrow">02 / Resolve evidence</span><h3>{comparedResult.counts.unresolved} patients need follow-up</h3><p>The export identifies each unresolved criterion and the evidence needed for follow-up.</p><button className="elab-link" onClick={() => { const p = comparedResult.patients.find((p) => p.classification === "unresolved"); if (p) inspectPatient(p); }} disabled={!comparedResult.counts.unresolved}>Inspect an open question</button></article></div>
              <details><summary>Underlying run exports</summary><ul className="showcase__downloads"><li><a href={flow.downloads(current.job.job_id).report} download>Baseline report (JSON)</a></li><li><a href={flow.downloads(compared.job.job_id).report} download>Scenario report (JSON)</a></li><li><a href={flow.downloads(compared.job.job_id).matrix} download>Scenario decision matrix (CSV)</a></li><li><a href={flow.downloads(compared.job.job_id).comparison} download>Changed patients (CSV)</a></li></ul></details></>}
            <div className="future-card"><h2>Design the protocol around the population it must recruit.</h2><p>Test eligibility criteria, compare justified alternatives and review the evidence before recruitment begins. Next: connect approved real-world health records to apply this workflow at population scale.</p><p>That is the answer to the question we started with: trials designed around real patient data, before the first patient is enrolled, can finish sooner.</p></div>
            {exportError ? <ErrorNotice error={exportError} /> : null}
          </>}
          <TechnicalSection scene={scene.id} result={result} />
        </div>}
        <footer className="scene-actions"><button className="elab-button elab-button--quiet" disabled={index === 0} onClick={() => go(index-1)}>← Back</button><span>{index + 1} of {SCENES.length}</span>
          {index === 2 && !current ? <button className="elab-button" disabled={!canRun || Boolean(running)} onClick={flow.runBaseline}>{flow.busy === "baseline" || running ? "Screening…" : `Screen all ${detail.data?.cohort.patients ?? ""} patients`}</button> : index === SCENES.length - 1 ? <button className="elab-button" disabled={!current || !compared || !comparedResult} onClick={exportReview}>Export review package ↓</button> : <button className="elab-button" disabled={!eligibleToContinue || !detail.data} onClick={() => go(index + 1)}>{scene.next} →</button>}
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
