# Verification and limits

Engine/service release: **0.2.5**. The live benchmark remains frozen on **0.2.4**. Reference bundle: **1.0.1**. Verification date: **28 October 2026**.

- Fresh offline installations on Python 3.11.12 and 3.14.6: 108 engine and 124 service tests pass on each.
- Reference gate: 77/77 checks on each interpreter; eight baseline/scenario identities and content digests agree across both.
- Fine-tuning artifact/scoring checks: 43 tests pass, including verification of the real wheel.
- Showcase: strict TypeScript, 25 unit/component tests, generated-client consistency, and browser reference/security tests pass.
- Synthetic provider browser test covers consent, cancellation, reload, resume, malformed output, explicit retry and pending interpretation review. This is not a live-model result.
- Standalone submission: offline dependency installation, source build, 25 frontend tests, generated-client check, two Chrome reference/security tests and one HTTP client integration test pass using only the public bundle. Eight packaging/export safety tests pass.
- Reproducible wheel and demo archive; final archive installs offline on both Python versions. Deterministic 100-patient recalculation medians are 24.3–31.5 ms on the M3 Max, worst observed 43.6 ms.

Expected reference answers are authored independently of engine execution, but the same implementer authored both artifacts and engine. Independent review and seeded-fault checks improve confidence; these are not clinical validation. Private evaluation families are separate but reuse evidence patterns, so results will not establish unseen-protocol generalization.

The live experiment is complete within its $15 / 600-request ceiling: 563 requests, $0.984817 locally calculated charges and $0.024875 held. [Measured results](BENCHMARK.md) separate narrative, criterion and patient agreement, first-pass failure and explicit recovery, raw interpretations and accounting limits. Genuine recorded replay and its browser flow passed without new provider requests. Portable recording import is verified in a fresh standalone archive: Chrome passes recorded baseline, all three scenarios, provenance/cost exports, reload and accessibility checks with zero new provider requests. Eight new service tests cover round-trip replay, corruption, private/synthetic exclusion, rollback, concurrent import, idempotency and preservation of later local reviews. Linux, Windows, provider-invoice reconciliation and event compliance remain unverified.
