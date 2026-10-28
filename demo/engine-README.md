# Eligibility Lab engine

`kitsa-eligibility-lab` is Eligibility Lab's calculation engine: it evaluates reviewed criterion rules against a cohort's evidence, classifies patients, builds waterfalls and criterion impact, and compares scenarios against an immutable baseline. Consumers install the wheel built here; the eligibility logic is never copied into another repository, worker or demo.

The calculation core (`eligibility_lab`) uses the Python standard library only (3.11+). It opens no network connection or database, reads no environment variables or credentials, imports nothing from `_common` or from the service, and never executes rule text as code. The optional local service (`eligibility_lab.service`, the `service` extra) is described in [Local service](#local-service).

## Build, install and run

```sh
packages/eligibility-lab/build-wheel.sh            # dist/kitsa_eligibility_lab-<version>-py3-none-any.whl and its SHA-256
python3 -m venv /tmp/eligibility-lab
/tmp/eligibility-lab/bin/pip install --no-index --no-deps packages/eligibility-lab/dist/kitsa_eligibility_lab-0.2.4-py3-none-any.whl
. /tmp/eligibility-lab/bin/activate

eligibility-lab validate  --bundle BUNDLE
eligibility-lab evaluate  --bundle BUNDLE [--scenario ID | --edit CRITERION.PARAMETER=VALUE ... --author NAME]
                          [--evaluation-date YYYY-MM-DD] [--order I1,I2,...] [--workspace ID] --output NEW.json
eligibility-lab compare   --bundle BUNDLE (--scenario ID | --edit ...) [--evaluation-date ...] --output NEW.json
eligibility-lab benchmark --bundle BUNDLE [--repeat N] --output NEW.json
```

The build runs offline with a fixed timestamp; identical sources and build toolchain give identical wheel bytes. Outputs are canonical JSON written once to a new owner-only file. Exit codes: `0` done; `1` written, but a run has execution failures; `2` refused, printed as `Refused: <code>: <message>`.

Core tests use only the standard library: `PYTHONPATH=src:tests python3 -m unittest discover -s tests`. The fine-tuning repository's `eligibility-lab verify-engine` installs a built wheel into a new environment and checks it against the reference case offline.

## Bundle contract

A bundle is a folder whose `manifest.json` (`kitsa/eligibility-lab-bundle/1`) gives `bundle_id`, `bundle_version`, `reference_date` and, for each input, its file name, SHA-256 and size. Every input must match byte for byte; inputs are bounded regular files, never symlinks, holding strict JSON with no duplicate keys or floats. Decimals are strings. Every object has a closed set of fields.

| Input | Format | Holds |
|---|---|---|
| `protocol` | `kitsa/eligibility-lab-protocol/1` | Protocol id, version, title and anchored passages. |
| `criteria` | `kitsa/eligibility-lab-criteria/1` | The criterion set's id and version, its protocol, the interpreter identity, narrative questions (`question_id`, `statement`) and criteria. |
| `cohort` | `kitsa/eligibility-lab-cohort/1` | Patients with typed evidence and dated notes. |
| `narrative` | `kitsa/eligibility-lab-narrative/2` | Narrative decisions and their source: `reference` (authored material) or `model`. |
| `scenarios` | `kitsa/eligibility-lab-scenarios/1` | Saved scenarios: id, title, author and parameter edits. |

A **criterion** has a stable id, `inclusion` or `exclusion` category, its original text (an exact quote of its anchored passage), the anchor, a review state (`approved`, `pending`, `rejected`; only approved criteria run) and an interpretation: `unsupported` with a reason, or `executable` with a rule version, typed parameters (`integer` or `decimal`, `editable` with explicit bounds, otherwise protected), an optional `applicability` rule and a `requirement` rule.

**Evidence** has a stable id, a concept, `observed_on`, an optional encounter id, `status` (`final` or `entered_in_error`), a value and provenance (`source_kind: structured`, `origin`). Notes have an id, `written_on`, an optional encounter id, text and provenance (`source_kind: note`). Concepts are closed:

| Concept | Value |
|---|---|
| `birth_date` | ISO date, not after `observed_on` |
| `sex` | code (`female`, `male`) |
| `nsclc_histology`, `systemic_therapy_history_complete` | `present` or `absent` |
| `disease_stage` | AJCC stage group code (`0`, `IA1` … `IVB`) |
| `ecog` | integer 0–5 |
| `neutrophils` | amount in `10*9/L` (canonical), `10*3/uL`, `/uL` or `/mm3` |
| `haemoglobin` | amount in `g/dL` (canonical), `g/L` or `mmol/L` (×1.6114, monomer basis) |
| `systemic_anticancer_regimen` | regimen id, `ongoing` or `completed`, `start_on`, `last_dose_on` (completed only, between start and record) |

A **narrative decision** binds one patient, question, evaluation date and window to the exact notes it considered, with `yes`, `no` or `undetermined` and, when undetermined, `insufficient_evidence`, `conflicting_evidence` or (model sources only) `model_abstention`. A decided answer must cite at least one supporting note. Its required `input_sha256` is the SHA-256 of canonical JSON (sorted keys, compact separators, UTF-8 with unescaped Unicode, no trailing newline) containing:

```json
{"format":"kitsa/eligibility-lab-narrative-binding/1","patient_id":"PATIENT_ID","question":{"question_id":"QUESTION_ID","statement":"EXACT_QUESTION_TEXT"},"evaluation_date":"2026-10-27","window_days":14,"notes":[]}
```

`notes` contains the complete considered note objects, including date, encounter and provenance, sorted by `note_id`; `model.narrative_binding` computes it, and `narrative.narrative_inputs` lists every patient, question and window a criterion set reads with the notes inside it. The engine verifies the hash and the complete set of notes in the window. A stale answer is `narrative_binding_mismatch`, including when text changes under an unchanged note or question ID. This binds retained answers to inputs; it does not establish that their interpretation is correct.

## Rules

Rules are trees of `and`/`or` (two or more arguments) and `not`; `age`; `measurement` (ordinal, or quantity with a supported unit); `code_in`; `assertion`; `regimen_count` and `days_since_last_dose`, each with a `history` assertion of `systemic_therapy_history_complete`; and `narrative`. Comparators are `lt`, `le`, `gt`, `ge`. A value is a literal or `{"param": name}`. Unknown operators, fields, concepts, units, codes or questions, undeclared or unused parameters and nesting deeper than 32 levels refuse the bundle.

## Decisions

A decision says whether the criterion statement is satisfied, before polarity: `yes`, `no` or `undetermined`. It carries `reasons` (`established`, `not_applicable`, or the undetermined causes `insufficient_evidence`, `conflicting_evidence`, `unrecognized_unit`, `unrecognized_code`, `model_abstention`, `unsupported_interpretation`), `applicability` (`unconditional`, `applicable`, `not_applicable`, `undetermined`), the cited evidence and note ids, narrative decision ids and source kinds (`structured`, `reference_narrative`, `model_narrative`). An `execution_failure` is a separate outcome with failure codes (`narrative_decision_unavailable`, `narrative_binding_mismatch`, `evaluation_error`); it is never a clinical result.

- Evidence qualifies when it is `final`, observed on or before the evaluation date and inside the window; a window of N days includes the date N days earlier. Measurements, codes and assertions read every qualifying record on the latest date, so an older favourable record never replaces a newer one. Disagreement on that date after unit normalization is `conflicting_evidence`, even when every value would pass. A missing or unlisted unit is never compared. No qualifying record is insufficient evidence: absence must be recorded as `absent`.
- Age is completed years on the evaluation date. Any two different recorded birth dates conflict.
- Regimens are counted once each, from their latest record. A count is a lower bound and the time since the last dose an interval until a completeness assertion inside its window establishes the history; `ongoing` means a dose on or after the record's date. A comparison is decided only when it holds, or fails, for every value it allows.
- A narrative leaf with no note in its window is insufficient evidence. Otherwise it needs a decision for the same patient, question, date, window and set of notes; anything else is an execution failure.
- `and`/`or`/`not` use three-valued logic; an execution failure counts as unknown, so a known `no` (or `yes`) still decides. Conditional criteria are normalized explicitly: an inclusion is `not applies or requirement`, an exclusion `applies and requirement`.

## Results

A patient fails on any inclusion `no` or exclusion `yes`, passes only when every inclusion is `yes` and every exclusion `no`, and is otherwise unresolved. A result holds the run record, criteria with effective parameters and rule digests, every patient's decisions and classification, counts, coverage, a waterfall in the stated order (each step's passing, failing and unresolved patients sum to the cohort; its last step is the classification in any order), criterion impact (each criterion waived alone, all others fixed; impacts are not additive) and age-band and sex summaries by classification. A comparison recalculates the baseline and the scenario on the same cohort and date and reports changed criteria, transitions, changed patients, the passing delta and both summaries.

`run_id` is the digest of the run record: bundle, protocol, effective criterion set, cohort, narrative source, evaluation date, scenario with its author and edits, waterfall order, interpreter, normalizer, evaluator and workspace. Identities are independent of input order. `content_digest` covers the whole result except `execution_metrics`, so identical inputs reproduce it. Decisions are cached by patient evidence and notes, the patient's narrative decisions, rule digest, interpreter, evaluation date and normalizer and evaluator identities; a threshold scenario recomputes only the criteria it edits. Scenarios edit only parameters marked editable, within their bounds; baseline criteria are never modified.

## Local service

The corrections for the independent review's answer-provenance and configuration-pinning findings (R1, R2) await re-review. Live experiments remain deferred; see the [review and correction handoff](../../docs/plans/eligibility-lab-stage-2-review.md).

`eligibility_lab.service` runs Eligibility Lab locally: installed bundles, reviewed interpretations, durable jobs, the Muse provider adapter with its cost ledger, exports and the `/v1` API with the showcase on one loopback origin. Every validation and calculation calls the core; the service holds no eligibility logic of its own.

```sh
python3 -m pip download --require-hashes -r service.lock --only-binary=:all: --dest WHEELHOUSE   # once, online
PYTHON=python3.11 packages/eligibility-lab/install-service.sh VENV [WHEELHOUSE]                  # offline, hash-checked
VENV/bin/eligibility-lab-service init --store output/eligibility-lab/local/store
VENV/bin/eligibility-lab-service install-bundle --store STORE --bundle REFERENCE/demonstration --audience public
VENV/bin/eligibility-lab-service install-bundle --store STORE --bundle REFERENCE/evaluation --audience private
VENV/bin/eligibility-lab-service serve --store STORE [--port 8765] [--assets SHOWCASE/dist] [--allow-origin http://127.0.0.1:5173]
VENV/bin/eligibility-lab-service openapi --output FILE
```

Operator commands also `review` proposals, `run-baseline` on any installed bundle, `interpret` criteria, manage an `experiment` and `export` a job's report; the module docstring of `service/cli.py` lists them. `service.lock` pins the extra (FastAPI, Uvicorn, httpx, Pydantic and their dependencies) by hash.

- **Store.** One SQLite file plus read-only bundle copies in an owner-only folder. The schema version is SQLite's `user_version`; opening a store applies missing upgrades in one transaction and refuses a newer store unchanged. Every change runs in an immediate transaction. Upgrading a schema 1 store keeps, for every answered item, a reference to the answer its result used; its jobs, which pinned no configuration, stay readable and exportable but never run again or supply reused answers.
- **Bundles.** `install-bundle` copies the manifest and its five inputs only (never expectations or provenance), verifies them with `load_bundle` and records the audience. Bundle identities cannot contain path separators; symlink destinations are refused. HTTP sees `public` bundles; `private` ones (the evaluation split) only the operator commands.
- **HTTP boundary.** Loopback binding; requests must name an allowed loopback Host. Changes need the per-process action token from `GET /v1/session` in `X-Eligibility-Lab-Action`, and are refused from another Origin or a cross-site fetch. No CORS headers are sent. Requests select bundles, proposals and jobs by identity, never by path, URL, upload, SQL or rule code; refusals are bounded `{"error": {code, message, problems}}` documents. The fixed `local-synthetic` workspace and `local-operator` identity do not claim production tenant authorization.
- **Interpretations.** Installing records each criterion's reference interpretation as a proposal awaiting review. Proposals are immutable and validated by the engine; an edit or a model answer is a new proposal needing its own review, and only valid proposals can be approved. Editability is server policy: the parameters the bundle's reference criteria mark editable (`I1.age_max`, `I7.max_regimens`), with their bounds; any other parameter is made protected. Model questions are namespaced by criterion. A model proposal's interpreter names the model, the digest of its request configuration and the transport that answered, so a synthetic test answer never passes as a genuine one; only an answer its job accepted becomes a proposal. A baseline pins one approved proposal per criterion; a set of unmodified reference proposals reproduces the installed criteria exactly, so its run identities match the CLI.
- **Jobs.** A job id is separate from the engine's run id. States are `queued`, `running`, `succeeded`, `partial` (a result with failed provider work or execution-failure cells), `failed` and `cancelled`. Claims increment a generation and take a lease; every later write checks both, so a superseded worker can neither record an item nor finalize. Results and the terminal state commit together, and a request still marked sent when its job stops becomes ambiguous. Each job pins its configuration when accepted: the evaluator, and for model work the provider request configuration (model, reasoning, token limit, prompt, schema, adapter), the transport (genuine or synthetic fixture) and the accounting; a scenario pins its baseline's. The worker (before work and before every request), resume, retry, recorded replay and comparisons refuse any difference with `configuration_changed`, before anything is reopened. An answered item references the exact attempt whose validated answer it accepted, set in the transaction that confirms the claim and that the attempt is still the item's current one. A late response, arriving after a reclaim or retry, is reconciled and retained but answers nothing, proposes nothing and is never reused. An idempotency key with the same request returns the same job and with another is refused; HTTP and operator keys are separate namespaces. The worker rechecks the interpretation reviews before running a job. Cancelling or stopping the service stops new dispatch; service shutdown records active model work as cancelled after reconciling in-flight responses; resuming requeues only work known not to have been sent; ambiguous or failed provider work is redone only by explicit retry of named items, as new attempts linked to the previous ones that always ask again, even when another job has an answer. A baseline pinned by a scenario cannot be resumed or retried. Scenario jobs never call a model: they rerun the engine on their baseline's narrative decisions. Operator commands run only the job they submit.
- **Modes.** `reference` uses the bundle's authored narrative decisions. `live` asks the model one question per patient, question and window that has notes, supplying every note in the window; the server computes each decision's `/2` binding from the notes it supplied. `recorded` replays genuine answers accepted by pinned jobs of the same audience whose retained request is the identical request and whose retained response still validates to the same answer, and reruns the engine; it is unavailable until such answers exist, and synthetic test responses never count. Failed model work leaves execution-failure cells, never reference answers.
- **Provider and budget.** `muse-spark-1.3` Chat Completions with `reasoning_effort: minimal`, bounded `max_tokens` (2,048 narrative, 4,096 interpretation), `store: false` and a strict closed JSON Schema; no retries, redirects or environment proxies. Responses are validated locally (envelope, model, finish reason, refusal, strict JSON nested at most 64 levels with storable text, schema, citations); a delivered response that cannot be read or recorded is a failed or ambiguous answer, never a crash, and its cost is kept. Live work needs `serve --enable-live` (or the live operator commands), an enabled experiment, `confirm_spend` and `MODEL_API_KEY`, which never leaves the process. An experiment has a ceiling across all its runs and retries and a request limit; all experiments in a store together may allocate at most $15. Any HTTP error, inconsistent usage or an ambiguous outcome stops further dispatch for the job. Response streams are closed once the 256 KiB limit is exceeded. Each attempt reserves (request bytes + 1,024) input tokens at $1.25/M and `max_tokens` at $4.25/M in the transaction that records its receipt, before sending; answered requests settle at prompt tokens plus completion tokens (which include reasoning), missing or inconsistent usage at least at the full reservation; only requests known not to have been sent release their reservations. All HTTP errors, timeouts and transport errors after sending stay held because failed-request billing is undocumented. Live work reuses an answer that some item accepted for the same request key (the bound inputs, the pinned request configuration and the transport), earliest first, from a pinned job of the same audience and transport, after checking that its retained request and response reproduce it.
- **Exports.** The JSON report (format `/2`) holds the job, its pinned configuration and digest, mode, bundle identities, interpretation set, engine result and narrative decisions. Its lineage gives, for every work item (a scenario's are its baseline's), the attempt whose answer it accepted, with the attempt's job, transport, request, response and configuration digests and charge, and whether the job sent it (`direct`), reused it (`cache`) or replayed it (`replay`). The job's own attempts are marked accepted or late, and costs keep its own requests apart from the source cost of reused answers. A source outside the reader's audiences is named only by its kind; the public items API also hides its attempt identity. No headers or credentials are exported. CSV matrices quote every cell and neutralise text a spreadsheet would read as a formula.

Service tests (no network, no model; synthetic provider transports only): `PYTHONPATH=src:tests:tests_service python -m unittest discover -s tests_service` with the extra installed. `test_reference_case` also runs the frozen reference case when the fine-tuning output is present.

## Operator planning and recovery

`eligibility-lab-service plan --store STORE --bundle-key BUNDLE --mode live` constructs the worker's exact requests without creating jobs, receipts, interpretation sets or reservations. It reports request hashes, the pinned configuration, maximum and currently uncached reservations, and exact available recordings. Add `--task interpretation` for criterion proposals, `--mode recorded` to check replay coverage, `--experiment ID` to inspect budget headroom, or `--output FILE` to retain an owner-only plan. Plans use the configured prices and token allowance; they do not verify provider billing. `run-baseline` and `interpret` accept `--expect-plan SHA256` and refuse changed inputs/configuration before submission. Cache availability can change without changing that plan identity.

Operator commands reach public and private bundles. `status` lists recent jobs (optionally `--bundle-key BUNDLE`), so interrupted private work can be found after a crash; `status --job ID` prints the job and items; `proposals --bundle-key BUNDLE` lists proposals for review/scoring; `cancel --job ID` stops new dispatch. `resume --job ID` continues unsent work, while `retry --job ID --item ITEM_ID` repeats only explicitly named failed or ambiguous items (`--item` is repeatable). Live recovery needs the original `--experiment ID`, an enabled experiment, `--confirm-spend` and the server-side key; ambiguous attempts may already be billed. Each command processes only its named job. `run-scenario --baseline ID --scenario scenario-ab --idempotency-key KEY` recalculates without a provider call. Recovery keeps the original configuration and refuses any drift; worker refusals retain the differing fields in reports and API errors.

The recorded-mode indicator requires an accepted genuine answer under the current provider configuration. Use a recorded request plan for exact coverage of a selected bundle and interpretation set; availability alone does not promise a complete recording.
