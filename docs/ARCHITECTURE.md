# Architecture

The browser calls a local `/v1` service on the same origin. The service installs synthetic bundles, records reviews and immutable jobs in local SQLite, and calls one pinned Eligibility Lab wheel for all calculations. The calculation core uses the Python standard library; HTTP/runtime dependencies are optional.

Muse interprets a criterion into a closed JSON rule proposal, which requires review before execution. For narrative decisions it receives the bounded notes in the declared observation window. Unsupported rules are rejected. A technical failure is separate from a clinical `no`; missing evidence does not establish absence. Patient failure follows any known inclusion failure or exclusion hit. Passing requires every criterion to resolve appropriately; other patients remain unresolved.

Reference mode uses explicitly authored narrative answers. Recorded mode reuses genuine validated responses pinned to evidence, question, date and evaluator settings. Live mode requires a server-side key and an enabled, bounded experiment. Scenario jobs reuse the baseline's narrative answers and recalculate deterministic thresholds without model calls.

The engine source is maintained in its owning repository and distributed here as the same versioned wheel used for verification. The public synthetic bundle is versioned and hashed. This submission excludes private evaluation data, production adapters, databases, credentials and model weights.
