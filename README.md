# Interactive Panoptic Quality Playground

Run the [interactive playground](https://koflerlab.github.io/Interactive-Panoptic-Quality/).

Interactive demo of the **Area Under Threshold Curve (AUTC)** metric from [panoptica](https://github.com/BrainLesion/panoptica). Drag prediction circles over reference segmentations (or use the global offset slider) and watch the Panoptic Quality vs IoU-threshold curve — and the AUTC number — update live.

## Deviations from panoptica

This is a teaching demo, not a port. The math is consistent with panoptica's definitions of PQ, SQ, RQ, and AUTC, but the surface around it differs in several ways.

- **Domain.** panoptica evaluates 2D / 3D voxel masks. This app only deals with 2D circles, so all area, IoU, and union-area computations are closed-form (`circleIoU`, `unionArea` via Green's theorem on disk-union boundaries) instead of pixel counting. There is no rasterization anywhere; the geometry is exact to machine precision.
- **Pipeline.** panoptica's full flow is *instance approximation → instance matching → instance evaluation*, mediated by a `MatchedInstancePair` and an `InstanceLabelMap`. Here matching and evaluation are inlined: matchers return a `MergedMatch[]`, which `computePQ` consumes directly. There is no relabeling step — for `maximize-merge` we compute the merged IoU analytically from the original circles instead of building a relabeled mask.
- **Hungarian.** panoptica calls `scipy.optimize.linear_sum_assignment`. We ship a from-scratch Kuhn–Munkres O(n³) implementation in [`src/lib/hungarian.ts`](src/lib/hungarian.ts), with rectangular cost matrices supported by padding.
- **`allow_many_to_one` on the greedy matcher is omitted.** In panoptica it works because the downstream pipeline merges the multiply-matched predictions into one mask before computing PQ. Without that merge step, counting each many-to-one pair as a separate TP gives a metric that's hard to interpret. Use `maximize-merge` if you want many-to-one semantics.
- **`MaximizeMergeMatching` uses analytical union area.** panoptica computes IoU on the rasterized union of merged masks. We compute `IoU(∪ preds, ref)` directly from circle positions and radii. No quantization error, no canvas, O(N²) per merged group.
- **SortedAP.** Not in panoptica. This is the metric from Chen et al., [*SortedAP: Rethinking evaluation metrics for instance segmentation*](https://arxiv.org/abs/2309.04887), implemented in [`computeSortedAPCurve`](src/lib/metrics.ts) using a maximal Hungarian-or-greedy match at a fuzz threshold and a running `tp / fp / fn` counter to handle the multi-pred drop in `maximize-merge` correctly. For one-to-one matchers it reduces to the closed-form `(TP₀ − k) / (N + FN₀ + k)`.

## Matcher comparison

The dropdown on the chart card switches the matching algorithm. All three are direct ports of panoptica's matchers from [`instance_matcher.py`](https://github.com/BrainLesion/panoptica/blob/main/panoptica/instance_matcher.py).

| Matcher | One-to-one? | Optimality | Cost | Use when |
| --- | --- | --- | --- | --- |
| **Greedy** (`NaiveThresholdMatching`) | yes | local | O((R·P) log(R·P)) | well-separated objects; you want the literature-standard PQ |
| **Hungarian** (`MaxBipartiteMatching`) | yes | global, max ΣIoU | O(N³), N = max(R, P) | objects contend for partners; one prediction sits between two refs |
| **Maximize merge** (`MaximizeMergeMatching`) | no — many-to-one | greedy + merge-improves | O((R·P) · merge-step IoU) | over-segmentation: one reference gets split across several predictions |

**How they decide.**
- *Greedy* sorts every (ref, pred) pair by IoU descending and walks the list, taking each pair if neither side is already used and the IoU clears the threshold.
- *Hungarian* builds a cost matrix where each above-threshold cell holds `1 − IoU` and below-threshold cells hold `1 + ε`, then runs the assignment problem and keeps pairs whose final cost is `< 1`. This finds the assignment that maximizes the sum of TP IoUs — greedy can pick a high-IoU pair early that blocks a globally better partition.
- *Maximize merge* iterates pairs by descending IoU, seeding each unmatched ref with its strongest pred (subject to threshold), then offering subsequent preds the chance to join an existing merge *only if* doing so raises `IoU(∪ preds, ref)`. A prediction is used at most once across all merges; the threshold gate applies only to seed matches.

**When they diverge.**
- On the default scene (well-separated circles), all three produce the same matches and identical curves.
- To see Hungarian beat greedy, place one prediction between two reference circles such that it has the highest IoU with one of them but a second prediction matches that ref nearly as well — greedy will take the first pairing and orphan the second prediction.
- To see `maximize-merge` beat both, place two prediction circles partially overlapping a single larger reference. With greedy/Hungarian one becomes a TP and one becomes an FP; with `maximize-merge` the second prediction joins the merge and the merged IoU rises.

Per-merge bookkeeping (refs/preds matched, `tp`, `fp`, `fn`, `sq`, merged IoU per ref) lives on `PQStats` in [`src/lib/metrics.ts`](src/lib/metrics.ts).

## Development

```bash
npm install
npm run dev
npm test
```

Deployed via GitHub Actions to GitHub Pages on push to `main`.
