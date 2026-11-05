# Simulate Clinical Trials · offline runtime

This folder contains the prebuilt application, engine **0.2.8**, hash-locked Python dependencies, public synthetic fixture **1.0.1**, and **391 genuine recorded Muse responses**. No API key, model credits, Node installation or private Kitsa repository is needed. Setup and the recorded walkthrough run offline after the package and Python have been obtained.

## Run

From this folder:

```sh
python3 verify.py
python3 setup.py --venv .venv
.venv/bin/python run.py --store ../local-store
```

Open **http://127.0.0.1:8765/**. Setup verifies and installs the bundled dependencies; startup imports the fixture, recorded evidence and criterion approvals.

## Stop and restart

Stop with **Control-C**. To resume later, run only:

```sh
.venv/bin/python run.py --store ../local-store --port 8765
```

Reviews, runs and results are stored in `../local-store`. Reimporting the same recording preserves subsequent work. For an independent session, choose a new directory and, if necessary, a free port:

```sh
.venv/bin/python run.py --store ../local-store-fresh --port 8770
```

Open http://127.0.0.1:8770/ for that session. Do not delete another store to resolve an import conflict. Setup refuses to overwrite existing environments; reuse `.venv` or install to a new path.

## Walkthrough and expected results

1. Read the illustrative lung-cancer protocol and ten draft eligibility criteria.
2. Inspect Patient 011's structured EHR facts, clinical notes and cited Muse answer. Age 78 and three prior regimens exceed both draft limits.
3. Evaluate the 100 synthetic patients in **Recorded model** mode.
4. Test age 75 → 80, prior regimens 2 → 3, and both together.
5. Compare the waterfalls and inspect changed patient decisions.
6. Export the proposed criteria and evidence for protocol review.

| Scenario | Eligible | Excluded | Unresolved |
| --- | ---: | ---: | ---: |
| Draft | 19 | 57 | 24 |
| Age revision | 29 | 44 | 27 |
| Regimen revision | 23 | 50 | 27 |
| Both revisions | 37 | 33 | 30 |

Patient 011 qualifies only after both changes. All scenarios use the same patients and evidence. **Explore the lab** exposes detailed criterion review, matrices, request traces and JSON/CSV downloads.

Recorded mode revalidates the retained Muse responses against their exact notes, questions and provider configuration, then executes the current engine. Reference mode uses authored synthetic answers. Neither mode makes new model calls. `run.py` removes an inherited `MODEL_API_KEY` and never enables live spending. The original live evaluator and charges remain historical evidence, separate from new recorded runs.

## Compatibility and troubleshooting

The offline bundle is tested on Python 3.15.2 on macOS ARM64. Other platforms have not been verified.

| Problem | Action |
| --- | --- |
| Python is missing or no matching wheel is found | Install the current Python 3.15 ARM64 interpreter for this offline bundle. |
| An environment already exists | Skip setup and run with that environment, or select a new `--venv` path. |
| `Artifact changed` or a missing file | Obtain an intact package. The verifier deliberately refuses modified runtime files. |
| The port is busy | Stop your previous server or choose another `--port` and browser URL. |
| Recording import refuses the store | Use a new `--store` path; unrelated existing work is never replaced. |
| The engine version or recorded configuration differs | Use the environment created by this package's setup and its unchanged reference fixture. |
| The browser cannot connect | Keep the server terminal running and use its exact `127.0.0.1` port. |

`artifact-manifest.json` records hashes and sizes of the retained files. `verify.py` checks integrity before installation and startup; it is not a publisher signature. Dependencies retain their licenses under `third-party/` and inside the wheels. See [engine-README.md](engine-README.md) for API and operator contracts.

The application is a local engineering demonstration with a fictional drug and synthetic EHRs. It includes no real patient data, private evaluation cases, credentials or model weights. It is not a production deployment or a clinically validated decision system. The Muse mark is retained from https://muse.ai/images/landing/brand/muse-logo.svg.
