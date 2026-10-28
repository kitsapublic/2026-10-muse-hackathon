# Muse benchmark — 28 October 2026

**The live experiment is complete.** Muse Spark 1.3 was called through Meta Model API with minimal reasoning and strict structured output, using wheel 0.2.4 and the fixed synthetic reference case. The engine, prompts, rules and evaluator configuration were frozen between the 100-patient demonstration and 40-patient private evaluation. The scorer verified the freeze and genuine response lineage.

| Measure | Demonstration | Private evaluation |
| --- | ---: | ---: |
| Patients | 100 | 40 |
| Narrative agreement | 353/391 (90.28%) | 137/160 (85.63%) |
| Final criterion agreement | 1,000/1,000 | 394/400 (98.5%) |
| Patient classification agreement | 100/100 | 38/40 (95%) |
| Patient false eligibility | 0/100 | 0/40 |
| Expected passes left unresolved | 0 | 2 |
| Criterion false passes / false failures | 0 / 0 | 0 / 0 |
| Extra unresolved criterion decisions | 0 | 6 (2 inclusion, 4 exclusion) |
| Valid narrative responses on first pass | 391/391 | 159/160 |
| Explicit narrative retries | 0 | 1 |
| Initial worker processing | 65.571 s | 33.392 s |
| Recovery worker processing | — | 3.058 s |
| Locally calculated narrative charge | $0.645200 | $0.308304, including retry |

Every narrative disagreement was an abstention where the authored reference made a determination. These disagreements can be masked by other branches of a criterion: perfect final criterion agreement on the demonstration does **not** mean perfect model narrative quality. The private cohort finished with 8 passing, 20 failing and 12 unresolved patients, compared with 10/20/10 in the reference.

One private response said `yes` without supporting citations. The validator rejected it as a technical failure, retained the full denominator, and one explicit retry of the identical request succeeded. Both attempts remain in local evidence and aggregate request/cost reporting. There was also one initial authentication failure before the canary succeeded. No automatic retry or prompt adjustment was used.

## Interpretation and scenario results

All ten raw model criterion proposals were structurally valid; two were structurally identical to the authored reference. This does not establish semantic equivalence for the remaining eight. For example, the CNS proposal uses one narrative question instead of the reference's explicit applicability branch. **All model proposals remain pending review.** Both narrative baselines use the same reviewed reference rules, so interpretation quality and narrative quality are separate measurements.

The live demonstration classified patients as 19 passing / 57 failing / 24 unresolved. Age, regimen and combined scenarios produced 29/44/27, 23/50/27 and 37/33/30. Scenario jobs made no provider calls. Recorded replay revalidated all 391 retained responses and reproduced every decision value, reason, evidence reference, classification and aggregate without another model request; run/decision IDs differ by execution. The real browser also verified recorded baseline and scenario execution with no provider requests.

## Accounting and evidence

The whole experiment used **563 requests**: 561 accepted model answers, one authentication failure and one citation-invalid response. The ledger records **$0.984817** calculated charges plus **$0.024875** conservatively held for the authentication failure, total exposure **$1.009692**. Limits were $15 and 600 requests. Dispatch is now disabled. These are local calculations, not a verified provider invoice; cached input is conservatively charged locally at the uncached rate. Reasoning is included in the reported completion-token count and is not added again.

The demonstration completed within the five-minute target. Private evaluation's final whole-job elapsed time was 209.454 seconds, including inspection and the explicit retry wait; its two worker executions totalled 36.450 seconds. Throughput reporting uses whole-job elapsed time, not just the last retry. A report-export float issue and retry denominator issue were corrected without changing model inputs or decisions; all 43 focused fine-tuning tests, including the offline wheel gate, pass.

- [Machine-readable aggregate results](../evidence/benchmark-summary.json)
- [Live demonstration report](../evidence/demonstration-live-report.json)
- [Recorded demonstration report](../evidence/demonstration-recorded-report.json)
- [Raw model criterion proposals](../evidence/model-interpretations.json)
- [Age scenario](../evidence/scenario-a-report.json), [regimen scenario](../evidence/scenario-b-report.json), [combined scenario](../evidence/scenario-ab-report.json)

Private case rows, notes, model responses and detailed evaluation reports are excluded. The standalone download remains an offline reference demo. Genuine recorded replay is available in the operator's local store; a portable recording importer is not included in this release.

These are measurements on one invented protocol. The evaluation families and note wording are held out, but they reuse demonstration evidence patterns. The results establish neither clinical validity nor unseen-protocol generalization, and they do not promote the model for real patient decisions.
