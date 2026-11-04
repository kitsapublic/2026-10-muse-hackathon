# Simulate Clinical Trials local demonstration

This package contains one engine wheel, its hash-locked runtime dependencies, the built showcase, the generated API client and React component packages, the public synthetic demonstration fixture, and the genuine Muse narrative responses from its completed live baseline. It has no private evaluation cohort, model weights, application credentials or real patient data. Licensing and event compliance remain separate release gates.

## Setup and run

Use Python 3.11 or 3.14 on macOS Apple Silicon (the offline wheelhouse is verified on those targets). Node is not needed to run the built showcase. Other platforms require compatible dependencies and independent verification.

```sh
python3 verify.py
python3 setup.py --venv .venv
.venv/bin/python run.py --store ../recorded-demo-store
```

Open http://127.0.0.1:8765/. The service binds to loopback. Stop with Control-C; the selected runs survive in the store. Setup refuses to overwrite an environment. `run.py` imports the bundled recordings into a fresh store, preserving their source reviews and lineage, then enables reference and recorded modes. No key is needed and no credits are spent. Live mode stays disabled. An existing store with different work is refused: choose a new path rather than deleting it. Restarts preserve reviews and runs. Do not replace the wheel in an existing experiment: jobs pin their evaluator configuration.

## Demonstration sequence

1. Introduce the protocol-writing problem and the draft NSCLC eligibility criteria. Treat the 100 synthetic EHRs as a representative population sample for the demonstration.
2. Read Patient 011's structured and unstructured EHR evidence. She is 78 with three prior systemic regimens: both draft thresholds exclude her. The before-and-after table shows why ages 18–80 and up to three regimens would let her qualify. Inspect Muse's cited clinical-note evidence alongside the structured facts.
3. Evaluate the draft criteria in **Recorded model** mode. The cumulative waterfall shows how 100 patients narrow to 19 eligible, 57 excluded and 24 unresolved.
4. Optimize the eligibility thresholds: upper age 75 → 80 gives 29 eligible; prior regimens 2 → 3 gives 23; both give 37. Patient 011 qualifies only after both changes.
5. Compare the draft and selected scenario waterfalls side by side. Both use the same population and scale, with changed thresholds highlighted. Inspect the patient-level evidence behind any change.
6. Export the proposed criteria, run identities and unresolved evidence for protocol review. **Explore the lab** opens full criterion review, adjustable thresholds and JSON/CSV exports.

The visual design follows Muse's public browser interface. The Muse mark beside the model attribution comes from https://muse.ai/images/landing/brand/muse-logo.svg; the application is Simulate Clinical Trials. System fonts are used throughout.

The fixture is engineering material, not a clinical recommendation or validation. Reference answers are labelled as authored material. Recorded model revalidates all 391 genuine responses from 28 October 2026 against their exact notes, questions and provider configuration, then executes the current engine. The original live result/evaluator stays historical; the new recorded run has its own identity. The imported source ledger contains only the demonstration baseline, with spending disabled and limits exhausted; it is not the full benchmark ledger. Live mode is never enabled by this launcher. The benchmark report describes measured model quality separately from engine correctness.

`artifact-manifest.json` records every retained file's hash and the engine version. `python3 verify.py` checks integrity; it is not a publisher signature. The JavaScript packages in `packages/` can be installed into a React application, and the engine/service is the same wheel used by the showcase. Dependency licenses are retained in their wheel/package artifacts. `engine-README.md` describes the contracts and operator commands.
