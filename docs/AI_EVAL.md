# AI evaluation plan

**Current status: no accuracy claims can be made.** Only the mock heuristic has been run; no real-model evaluation has been performed, and the two sample cases are demonstrations, not a benchmark.

## What exists
- Deterministic tests of rules, the claims policy (blocks/allows), grounding checks and the fallback path.
- `pnpm demo:sample`: runs the virtual case's silent walkthrough + 3 stills through the full pipeline **without** the reference report or job findings in any input. Intake uses only facts from the booking form (`client_concern`), mapped to approved enums.

## Sample-pack observations (data quality, flagged not fixed)
- Reference virtual report lists the Quebec property followed by ", ON" (p.5).
- Walkthrough frame ~0:04 shows a person's face despite de-identification of the call.
- Video is low resolution: most frames score below the stills on sharpness, as the pack README warns.
- On-site case photo filenames encode instrument results (e.g. `07_Swab_test_positive_for_mold.jpg`). Filenames are **never** passed to the model or used as evidence.

## Planned evaluation (Phase 2/5)
1. **Dataset**: expert-labelled cases stratified by room, lighting, material, modality (video/photo/form), image quality, and true negatives (dust, shadows, rust, soot). Target size set with the business; two cases is not enough.
2. **Labels per frame**: visible features + location, usability, privacy content.
3. **Metrics**: grounded observation precision/recall; timestamp correctness; hallucination rate (observations on frames that don't show them); prohibited-claim rate before the gate (gate catches); abstention rate when frames are unusable; question relevance (expert rating); cost and latency per case.
4. **Protocol**: blinded, reference reports compared in a separate scoring step; fixed prompt/model/rule versions per run (recorded in `assessment_runs`); report all failures, not just the average.
5. **Release gate**: automatic publishing stays behind `FEATURE_REPORT_PUBLISHING` and requires expert review of a representative set (PLAN §12).
6. **Feedback loop**: staff `observation.rejected` corrections become evaluation items, not prompt patches.
