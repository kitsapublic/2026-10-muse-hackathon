# Eligibility Lab local demonstration

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

1. Read the invented protocol and the fixed evaluation date, 27 October 2026.
2. Inspect the ten criteria and their retained reference approvals. Select **Recorded model**; you can also select **Reference** to compare authored answers.
3. Run the baseline: 19 meet every criterion, 57 fail, 24 remain unresolved, out of 100.
4. Raise the upper age limit from 75 to 80: 29 pass. Increase prior regimens from 2 to 3: 23 pass.
5. Apply both changes: 37 pass. The gains overlap; the engine recalculates every scenario.
6. Inspect the waterfall, criterion impact, changed patients and JSON/CSV exports. Missing evidence stays unresolved.

The fixture is engineering material, not a clinical recommendation or validation. Reference answers are labelled as authored material. Recorded model revalidates all 391 genuine responses from 28 October 2026 against their exact notes, questions and provider configuration, then executes the current engine. The original live result/evaluator stays historical; the new recorded run has its own identity. The imported source ledger contains only the demonstration baseline, with spending disabled and limits exhausted; it is not the full benchmark ledger. Live mode is never enabled by this launcher. The benchmark report describes measured model quality separately from engine correctness.

`artifact-manifest.json` records every retained file's hash and the engine version. `python3 verify.py` checks integrity; it is not a publisher signature. The JavaScript packages in `packages/` can be installed into a React application, and the engine/service is the same wheel used by the showcase. Dependency licenses are retained in their wheel/package artifacts. `engine-README.md` describes the contracts and operator commands.
