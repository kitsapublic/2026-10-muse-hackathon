# Verification and limits

Engine/service release: **0.2.4**. Reference bundle: **1.0.1**. Verification date: **28 October 2026**.

- Fresh offline installations on Python 3.11.12 and 3.14.6: 108 engine and 116 service tests pass on each.
- Reference gate: 77/77 checks on each interpreter; eight baseline/scenario identities and content digests agree across both.
- Fine-tuning artifact/scoring checks: 41 tests pass, including verification of the real wheel.
- Showcase: strict TypeScript, 25 unit/component tests, generated-client consistency, and browser reference/security tests pass.
- Synthetic provider browser test covers consent, cancellation, reload, resume, malformed output, explicit retry and pending interpretation review. This is not a live-model result.
- Standalone submission: offline dependency installation, source build, 25 frontend tests, generated-client check, two Chrome reference/security tests and one HTTP client integration test pass using only the public bundle. Seven packaging/export safety tests pass.
- Reproducible wheel and demo archive; final archive installs offline on both Python versions. Deterministic 100-patient recalculation medians are 24.3–31.5 ms on the M3 Max, worst observed 43.6 ms.

Expected reference answers are authored independently of engine execution, but the same implementer authored both artifacts and engine. Independent review and seeded-fault checks improve confidence; these are not clinical validation. Private evaluation families are separate but reuse evidence patterns, so results will not establish unseen-protocol generalization.

The authorized live experiment has a local $15 and 600-request ceiling. Its planned 561 requests have a $7.259288 maximum local reservation under the configured rates, not a provider-side billing guarantee. No live call has yet run; model quality, actual token accounting, latency and genuine replay remain unverified. Linux, Windows and event compliance are also unverified.
