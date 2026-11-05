# Kitsa · Simulate Clinical Trials

Test eligibility criteria against patient evidence while the protocol is being written, before recruitment begins.

This application combines Muse Spark's cited interpretation of clinical notes with deterministic checks of age, laboratory results and treatment history. Researchers can see which criteria exclude patients, compare proposed thresholds and export the evidence for protocol review.

[Watch the 2:55 demo](https://youtu.be/lIPVKNjBGnM) · [Kitsa](https://www.kitsa.ai) · [Architecture](docs/ARCHITECTURE.md) · [Benchmark](docs/BENCHMARK.md)

## Quick start

The demo includes the prebuilt application, 100 synthetic patient EHRs and recorded Muse responses. No API key is needed.

```sh
git clone https://github.com/kitsapublic/2026-10-muse-hackathon.git
cd 2026-10-muse-hackathon

python3 demo/verify.py
python3 demo/setup.py --venv demo/.venv
demo/.venv/bin/python demo/run.py --store local-store
```

Open **http://127.0.0.1:8765/**. The app starts in **Recorded model** mode. Setup runs once; restart with the last command. Reviews and results persist in `local-store`.

Use `--port 8770` for another port or `--store local-store-fresh` for a separate session. Stop the server with **Control-C**. [Runtime details](demo/README.md).

## Demo workflow

The guided walkthrough defaults to **Recorded model** and has six steps:

1. Read the illustrative ELX-101 lung-cancer protocol and its ten draft eligibility criteria.
2. Inspect Patient 011's EHR and a cited Muse answer. She is 78 and has three prior systemic treatment regimens; both draft limits exclude her.
3. Evaluate the 100-patient cohort. The waterfall shows where eligibility is lost.
4. Test a higher age limit, a higher prior-treatment limit, or both.
5. Compare the population waterfalls and inspect the patients whose status changes.
6. Export the proposed criteria, population impact and unresolved evidence for protocol review.

**Explore the lab** opens criterion review, detailed decision matrices, request traces and JSON/CSV report downloads.

| Scenario | Eligible | Excluded | Unresolved |
| --- | ---: | ---: | ---: |
| Draft criteria | 19 | 57 | 24 |
| Upper age 75 → 80 | 29 | 44 | 27 |
| Prior regimens 2 → 3 | 23 | 50 | 27 |
| Both changes | 37 | 33 | 30 |

Both revisions add **18 eligible patients**. Patient 011 needs both. The same 100 patients, evidence and other eight criteria are used in every scenario. Unresolved patients are shown separately and are not counted as eligible. The assessment date is fixed at 27 October 2026 for reproducible results.

## What Muse does

Muse Spark 1.3, accessed through Meta Model API, proposes structured interpretations of protocol criteria and answers bounded questions about dated clinical notes with supporting citations. Proposed interpretations require review; this demonstration uses reviewed reference rules. The application validates model responses and citations, then combines accepted clinical facts with deterministic numeric and date checks.

| Mode | Evidence used | New model calls |
| --- | --- | --- |
| Recorded model — default | Genuine retained Muse responses, revalidated against their exact inputs | None |
| Reference answers | Authored narrative answers from the synthetic fixture | None |
| Live model | New Muse responses | Disabled by the demo launcher |

Recorded mode reruns the engine; the results are not a static presentation. Threshold scenarios reuse the baseline evidence without additional model calls. The launcher removes an inherited `MODEL_API_KEY` and never enables live spending. Live experiments require a separately configured service, an enabled budget and explicit spending consent; see the [engine operator documentation](demo/engine-README.md).

The original live 100-patient run took approximately **66 seconds**, used **277,544 tokens** and had **$0.6452 in locally calculated model charges**. These are retained benchmark measurements, not the cost or speed of recorded replay. See [the benchmark](docs/BENCHMARK.md) for model-quality results, evaluation limits and accounting assumptions.

## Develop the frontend

After the quick start, run from the repository root. The frontend uses Node.js 22+ and npm 11.6.2:

```sh
npx --yes npm@11.6.2 ci
npm run typecheck
npm test
npm run check:client
npm run build
```

`npm run build` writes the showcase to `apps/showcase/dist`; it does not replace the prebuilt `demo/showcase`. Stop the demo server before serving your new build on the same port:

```sh
demo/.venv/bin/eligibility-lab-service serve \
  --store local-store --port 8765 --assets apps/showcase/dist
```

For hot reload, stop that server and use two terminals, both at the repository root.

**Terminal 1 — API service, using the store initialized by the quick start:**

```sh
demo/.venv/bin/eligibility-lab-service serve \
  --store local-store --port 8765 \
  --allow-origin http://127.0.0.1:5173
```

**Terminal 2 — frontend:**

```sh
npm run dev -w @kitsa/eligibility-lab-showcase
```

Open **http://127.0.0.1:5173/**. Vite proxies `/v1` to port 8765. If the backend uses another port, set `ELIGIBILITY_LAB_SERVICE=http://127.0.0.1:8770` before the frontend command. In this Vite setting the variable is a URL; in the test runner below it is the executable path.

## Verify locally

The commands above check types, unit/component tests, generated-client consistency and the build. For the real service and browser workflow, install Google Chrome and run:

```sh
ELIGIBILITY_LAB_SERVICE="$PWD/demo/.venv/bin/eligibility-lab-service" \
ELIGIBILITY_LAB_REFERENCE="$PWD/demo/reference" \
ELIGIBILITY_LAB_PORT=8876 sh scripts/run-e2e.sh
```

This creates its own temporary store, builds the showcase, starts and stops its own server, and runs the reference browser flow and client integration check. Leave port 8876 free.

For the recorded Muse flow, keep the quick-start server running on port 8765 in another terminal and run:

```sh
ELIGIBILITY_LAB_RECORDED_BROWSER=1 \
ELIGIBILITY_LAB_URL=http://127.0.0.1:8765 \
npm run e2e -w @kitsa/eligibility-lab-showcase -- guided-story.spec.ts recorded-flow.spec.ts
```

These checks create local demo jobs. Use a separate store if you want to preserve a rehearsal session unchanged. No live model calls are made.

**Known verification issue:** `recorded-flow.spec.ts` passes, including all three scenario counts, evidence lineage, exports and reload. `guided-story.spec.ts` reaches protocol review but currently fails its accessibility check: the result summary in [App.tsx](apps/showcase/src/App.tsx) has invalid definition-list markup (`axe: definition-list`). The command above therefore does not yet finish fully green. This does not change the eligibility calculations.

## Compatibility and troubleshooting

The bundled offline runtime is tested on Python 3.15.2 on macOS ARM64. Other platforms have not been verified. Browser tests use Google Chrome.

| Symptom | Fix |
| --- | --- |
| `python3` is missing or reports an older version | Install the latest stable Python; use `python3.15` if the system `python3` still points to an older installation. |
| `No matching distribution found` during setup | Use the current Python 3.15 ARM64 interpreter with this offline bundle. |
| `Choose a new --venv directory` | The environment already exists. Use it to run the app, or pass a new environment path to setup and use that path in subsequent commands. |
| `Artifact changed` or `Missing or unsafe artifact` | A bundled file differs from its manifest. Obtain a clean copy of the demo. Do not bypass verification or hand-edit the packaged runtime. |
| `Address already in use` | Stop the other server or select a free `--port`, then open that port in the browser. |
| Import refuses an existing store | Choose a new `--store` directory. Import will not merge unrelated jobs or replace existing work. |
| Recorded mode is unavailable or reports `configuration_changed` | Start through `demo/run.py` with the bundled environment and an untouched fixture. Custom rules or a different engine/provider configuration may not match the retained recordings. |
| UI loads but actions fail in development | Use `127.0.0.1:5173`, start the API with the exact `--allow-origin` shown above, and check the proxy's backend port. Refresh the page after restarting the service. |
| Source edits do not appear | `demo/run.py` serves `demo/showcase`. Use Vite or rebuild and serve `apps/showcase/dist` as described above. |
| npm dependency resolution fails | Install with `npx --yes npm@11.6.2 ci`; npm 10 is not the supported installer for this lockfile. |
| Browser tests cannot find Chrome | Install Google Chrome. The test configuration uses the `chrome` channel. |

## Repository map

| Path | Purpose |
| --- | --- |
| `apps/showcase/` | React/TypeScript application and browser tests |
| `packages/eligibility-client/` | Typed API client and retained OpenAPI schema |
| `packages/eligibility-ui/` | Reusable React components |
| `demo/` | Offline runtime, engine wheel, public fixture and recorded responses |
| `evidence/` | Retained benchmark, scenario and model-interpretation evidence |
| `docs/` | Architecture, walkthrough, benchmark and verification details |
| `submission-manifest.json` | Hashes and sizes of the distributed files |

The frontend is version **0.4.0**, the packaged engine/service is **0.2.8**, and the reference fixture is **1.0.1**. The historical live benchmark retains its original evaluator **0.2.4**. Artifact hashes check integrity; they are not publisher signatures.

## Scope and licensing

This is a local hackathon demonstration with a fictional drug and entirely synthetic patient records. It contains no real patient data or private evaluation cases. The service binds to loopback and uses a local operator identity; it is not a hosted, multi-tenant production service. Clinical validation, real EHR integration and million-patient capacity remain future work.

Third-party licenses are retained under `demo/third-party/` and within the dependency wheels. No general open-source license has yet been selected for Kitsa-authored files.
