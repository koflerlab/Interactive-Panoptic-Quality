import { describe, it, expect } from 'vitest'
import { type Circle } from './geometry'
import {
  computePQ,
  computeCurve,
  computeAUTC,
  computeAUTCStep,
  computeSortedAPCurve,
  computeSortedAP,
  defaultThresholds,
  sceneThresholds,
} from './metrics'

const c = (x: number, y: number, r: number): Circle => ({ x, y, r })

describe('defaultThresholds', () => {
  it('produces evenly spaced thresholds from the step up to 1.0', () => {
    const ts = defaultThresholds(0.05)
    expect(ts[0]).toBeCloseTo(0.05, 12)
    expect(ts[ts.length - 1]).toBeCloseTo(1.0, 12)
    expect(ts.length).toBe(20)
    // Spacing
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i] - ts[i - 1]).toBeCloseTo(0.05, 9)
    }
  })

  it('caps the final value at 1.0', () => {
    const ts = defaultThresholds(0.3)
    expect(ts[ts.length - 1]).toBeLessThanOrEqual(1.0)
  })

  it('respects custom step size', () => {
    expect(defaultThresholds(0.25)).toEqual([0.25, 0.5, 0.75, 1.0])
  })
})

describe('sceneThresholds', () => {
  it('always includes 0 and 1', () => {
    const ts = sceneThresholds([], [])
    expect(ts).toContain(0)
    expect(ts).toContain(1)
  })

  it('is sorted ascending', () => {
    const refs = [c(0, 0, 1), c(2, 0, 1)]
    const preds = [c(0.3, 0, 1), c(2.4, 0, 1)]
    const ts = sceneThresholds(refs, preds)
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i]).toBeGreaterThan(ts[i - 1])
    }
  })

  it('every interior threshold falls in (0, 1)', () => {
    const refs = [c(0, 0, 1)]
    const preds = [c(0.3, 0, 1), c(0.7, 0, 1)]
    const ts = sceneThresholds(refs, preds)
    for (const t of ts) {
      if (t !== 0 && t !== 1) {
        expect(t).toBeGreaterThan(0)
        expect(t).toBeLessThan(1)
      }
    }
  })

  it('produces one threshold per unique positive pairwise IoU < 1, plus 0 and 1', () => {
    // Two refs and two preds, fully disjoint between groups but with one
    // pred-ref pair perfectly identical (IoU = 1 → not added) and two distinct
    // partial overlaps.
    const refs = [c(0, 0, 1), c(10, 0, 1)]
    const preds = [c(0, 0, 1), c(10.4, 0, 1)] // first IoU=1, second IoU≈ partial
    const ts = sceneThresholds(refs, preds)
    expect(ts).toContain(0)
    expect(ts).toContain(1)
    // Exactly one extra threshold (the partial overlap), since IoU=1 is excluded
    // from the dynamic set and there are no cross-group pairs (refs[0] vs preds[1]
    // and refs[1] vs preds[0] are disjoint).
    expect(ts.length).toBe(3)
  })
})

describe('computePQ — degenerate inputs', () => {
  it('all-empty: tp=0, sq=0, rq=0, pq=0', () => {
    const s = computePQ([], [], 0.5, 'greedy')
    expect(s.tp).toBe(0)
    expect(s.fp).toBe(0)
    expect(s.fn).toBe(0)
    expect(s.sq).toBe(0)
    expect(s.rq).toBe(0)
    expect(s.pq).toBe(0)
    expect(s.matchedPairs).toEqual([])
    expect(s.mergedMatches).toEqual([])
  })

  it('refs only → all FN', () => {
    const s = computePQ([c(0, 0, 1), c(2, 0, 1)], [], 0.5, 'greedy')
    expect(s.tp).toBe(0)
    expect(s.fp).toBe(0)
    expect(s.fn).toBe(2)
    expect(s.pq).toBe(0)
  })

  it('preds only → all FP', () => {
    const s = computePQ([], [c(0, 0, 1), c(2, 0, 1)], 0.5, 'greedy')
    expect(s.tp).toBe(0)
    expect(s.fp).toBe(2)
    expect(s.fn).toBe(0)
    expect(s.pq).toBe(0)
  })
})

describe('computePQ — formula correctness', () => {
  it('perfect match: tp=N, fp=fn=0, sq=rq=pq=1', () => {
    const refs = [c(0, 0, 1), c(5, 0, 1)]
    const preds = [c(0, 0, 1), c(5, 0, 1)]
    const s = computePQ(refs, preds, 0.5, 'greedy')
    expect(s.tp).toBe(2)
    expect(s.fp).toBe(0)
    expect(s.fn).toBe(0)
    expect(s.sq).toBeCloseTo(1, 12)
    expect(s.rq).toBeCloseTo(1, 12)
    expect(s.pq).toBeCloseTo(1, 12)
  })

  it('SQ is the mean IoU of TPs', () => {
    const refs = [c(0, 0, 1), c(5, 0, 1)]
    const preds = [c(0, 0, 1), c(5.2, 0, 1)] // first perfect, second slightly off
    const s = computePQ(refs, preds, 0.0001, 'greedy')
    const expected = s.matchedPairs.reduce((acc, p) => acc + p.iou, 0) / s.tp
    expect(s.sq).toBeCloseTo(expected, 12)
  })

  it('RQ matches its definition tp / (tp + 0.5*fp + 0.5*fn)', () => {
    const refs = [c(0, 0, 1), c(5, 0, 1), c(10, 0, 1)] // 3 refs
    const preds = [c(0.1, 0, 1), c(5.1, 0, 1)] // 2 preds, both match
    const s = computePQ(refs, preds, 0.0001, 'greedy')
    // tp=2, fp=0, fn=1 → rq = 2 / (2 + 0 + 0.5) = 0.8
    expect(s.tp).toBe(2)
    expect(s.fp).toBe(0)
    expect(s.fn).toBe(1)
    expect(s.rq).toBeCloseTo(2 / 2.5, 12)
  })

  it('PQ = SQ * RQ', () => {
    const refs = [c(0, 0, 1), c(5, 0, 1), c(10, 0, 1)]
    const preds = [c(0.2, 0, 1), c(5.4, 0, 1), c(20, 20, 1)]
    const s = computePQ(refs, preds, 0.0001, 'greedy')
    expect(s.pq).toBeCloseTo(s.sq * s.rq, 12)
  })

  it('matchedPairs is the flatten of mergedMatches', () => {
    const refs = [c(0, 0, 2)]
    const preds = [c(-0.6, 0, 1), c(0.6, 0, 1)]
    const s = computePQ(refs, preds, 0.0001, 'maximize-merge')
    const expectedFlat = s.mergedMatches.flatMap((m) =>
      m.predIdxs.map((j) => ({ refIdx: m.refIdx, predIdx: j, iou: m.iou })),
    )
    expect(s.matchedPairs).toEqual(expectedFlat)
  })

  it('one-to-one matchers preserve tp+fp = preds.length and tp+fn = refs.length', () => {
    const refs = [c(0, 0, 1), c(5, 0, 1)]
    const preds = [c(0.1, 0, 1), c(99, 0, 1), c(100, 0, 1)]
    for (const kind of ['greedy', 'hungarian'] as const) {
      const s = computePQ(refs, preds, 0.0001, kind)
      expect(s.tp + s.fp).toBe(preds.length)
      expect(s.tp + s.fn).toBe(refs.length)
    }
  })

  it('maximize-merge: tp = unique merged refs; fp = unmatched preds; fn = unmatched refs', () => {
    const refs = [c(0, 0, 2), c(5, 0, 1)]
    const preds = [
      c(-0.6, 0, 1), // joins ref 0
      c(0.6, 0, 1), // joins ref 0 (merge)
      c(99, 99, 1), // pure FP
    ]
    const s = computePQ(refs, preds, 0.0001, 'maximize-merge')
    expect(s.tp).toBe(1) // only ref 0 was matched
    expect(s.fp).toBe(1) // pred 2 unmatched
    expect(s.fn).toBe(1) // ref 1 unmatched
  })
})

describe('computeCurve', () => {
  it('produces one CurvePoint per threshold', () => {
    const refs = [c(0, 0, 1)]
    const preds = [c(0.1, 0, 1)]
    const ts = [0.1, 0.3, 0.5, 0.7, 0.9]
    const curve = computeCurve(refs, preds, ts, 'greedy')
    expect(curve.length).toBe(ts.length)
    for (let i = 0; i < ts.length; i++) {
      expect(curve[i].threshold).toBe(ts[i])
    }
  })

  it('PQ values match computePQ at the same thresholds', () => {
    const refs = [c(0, 0, 1), c(3, 0, 1)]
    const preds = [c(0.2, 0, 1), c(3.5, 0, 1)]
    const ts = [0.1, 0.3, 0.5, 0.7, 0.9]
    const curve = computeCurve(refs, preds, ts, 'greedy')
    for (let i = 0; i < ts.length; i++) {
      const direct = computePQ(refs, preds, ts[i], 'greedy')
      expect(curve[i].pq).toBeCloseTo(direct.pq, 12)
    }
  })

  it('PQ is non-increasing in threshold for one-to-one matching', () => {
    // For greedy/hungarian, raising the threshold can only drop matches, so PQ
    // is monotonically non-increasing.
    const refs = [c(0, 0, 1), c(2.5, 0, 1)]
    const preds = [c(0.1, 0, 1), c(2.7, 0, 1)]
    const ts = defaultThresholds(0.05)
    for (const kind of ['greedy', 'hungarian'] as const) {
      const curve = computeCurve(refs, preds, ts, kind)
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i].pq).toBeLessThanOrEqual(curve[i - 1].pq + 1e-12)
      }
    }
  })
})

describe('computeAUTC (trapezoidal)', () => {
  it('returns 0 for fewer than two points', () => {
    expect(computeAUTC([])).toBe(0)
    expect(
      computeAUTC([{ threshold: 0.5, pq: 1, sq: 1, rq: 1, tp: 1 }]),
    ).toBe(0)
  })

  it('integrates a known step-down curve correctly', () => {
    // Curve: pq=1 at every threshold from 0.1 to 1.0 in 0.1 steps.
    // The trapezoidal area from t=0 (pq=pq[0]=1) to t=1 (pq=1) is just 1.
    const curve = Array.from({ length: 10 }, (_, i) => ({
      threshold: 0.1 * (i + 1),
      pq: 1,
      sq: 1,
      rq: 1,
      tp: 1,
    }))
    expect(computeAUTC(curve)).toBeCloseTo(1, 12)
  })

  it('handles a linearly decreasing curve', () => {
    // pq(t) = 1 - t at t = 0.1, 0.2, ..., 1.0.  The trapezoidal AUTC with a
    // virtual prepended point (t=0, pq=pq[0]=0.9) integrates the resulting
    // piecewise-linear curve.  Compute the expected value directly.
    const curve = Array.from({ length: 10 }, (_, i) => {
      const t = 0.1 * (i + 1)
      return { threshold: t, pq: 1 - t, sq: 1 - t, rq: 1, tp: 1 }
    })
    const xs = [0, ...curve.map((p) => p.threshold)]
    const ys = [curve[0].pq, ...curve.map((p) => p.pq)]
    let expected = 0
    for (let i = 0; i < xs.length - 1; i++) {
      expected += (xs[i + 1] - xs[i]) * (ys[i] + ys[i + 1]) * 0.5
    }
    expect(computeAUTC(curve)).toBeCloseTo(expected, 12)
  })
})

describe('computeAUTCStep', () => {
  it('returns 0 for fewer than two points', () => {
    expect(computeAUTCStep([])).toBe(0)
    expect(
      computeAUTCStep([{ threshold: 0.5, pq: 1, sq: 1, rq: 1, tp: 1 }]),
    ).toBe(0)
  })

  it('integrates a step function: width × right-endpoint pq', () => {
    const curve = [
      { threshold: 0.0, pq: 0.5, sq: 0.5, rq: 1, tp: 1 },
      { threshold: 0.4, pq: 0.7, sq: 0.7, rq: 1, tp: 1 },
      { threshold: 1.0, pq: 0.1, sq: 0.1, rq: 1, tp: 1 },
    ]
    // step area = (0.4 - 0.0) * 0.7 + (1.0 - 0.4) * 0.1 = 0.28 + 0.06 = 0.34
    expect(computeAUTCStep(curve)).toBeCloseTo(0.34, 12)
  })
})

describe('AUTC decomposition via pick parameter', () => {
  const curve = [
    { threshold: 0.0, pq: 0.4, sq: 0.8, rq: 0.5, tp: 1 },
    { threshold: 0.5, pq: 0.6, sq: 0.6, rq: 1.0, tp: 1 },
    { threshold: 1.0, pq: 0.0, sq: 0.0, rq: 0.0, tp: 0 },
  ]

  it('computeAUTCStep integrates SQ and RQ when pick is provided', () => {
    // SQ step: (0.5-0.0)*0.6 + (1.0-0.5)*0.0 = 0.30
    expect(computeAUTCStep(curve, (p) => p.sq)).toBeCloseTo(0.3, 12)
    // RQ step: (0.5-0.0)*1.0 + (1.0-0.5)*0.0 = 0.50
    expect(computeAUTCStep(curve, (p) => p.rq)).toBeCloseTo(0.5, 12)
  })

  it('computeAUTC trapezoidal integrates SQ and RQ when pick is provided', () => {
    // SQ trapezoid with virtual (0, sq[0]=0.8): (0-0)*(0.8+0.8)/2 + (0.5-0)*(0.8+0.6)/2 + (1.0-0.5)*(0.6+0)/2 = 0 + 0.35 + 0.15 = 0.50
    expect(computeAUTC(curve, (p) => p.sq)).toBeCloseTo(0.5, 12)
    // RQ trapezoid with virtual (0, rq[0]=0.5): 0 + (0.5)*(0.5+1)/2 + (0.5)*(1+0)/2 = 0 + 0.375 + 0.25 = 0.625
    expect(computeAUTC(curve, (p) => p.rq)).toBeCloseTo(0.625, 12)
  })

  it('default pick still returns the PQ integral', () => {
    expect(computeAUTC(curve)).toBeCloseTo(computeAUTC(curve, (p) => p.pq), 12)
    expect(computeAUTCStep(curve)).toBeCloseTo(
      computeAUTCStep(curve, (p) => p.pq),
      12,
    )
  })
})

describe('computeSortedAPCurve', () => {
  it('returns a single zero point when nothing matches', () => {
    const refs = [c(0, 0, 1)]
    const preds = [c(100, 100, 1)]
    expect(computeSortedAPCurve(refs, preds, 'greedy')).toEqual([
      { threshold: 0, ap: 0 },
    ])
  })

  it('starts at threshold 0 with the maximum AP value', () => {
    const refs = [c(0, 0, 1), c(5, 0, 1)]
    const preds = [c(0.1, 0, 1), c(5.1, 0, 1)]
    const curve = computeSortedAPCurve(refs, preds, 'greedy')
    expect(curve[0].threshold).toBe(0)
    expect(curve[0].ap).toBe(curve.reduce((m, p) => Math.max(m, p.ap), 0))
  })

  it('is non-increasing in AP', () => {
    const refs = [c(0, 0, 1), c(5, 0, 1), c(10, 0, 1)]
    const preds = [c(0.3, 0, 1), c(5.5, 0, 1), c(10.7, 0, 1)]
    const curve = computeSortedAPCurve(refs, preds, 'greedy')
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].ap).toBeLessThanOrEqual(curve[i - 1].ap + 1e-12)
    }
  })

  it('breakpoints are at the matched IoUs in ascending order (one-to-one matchers)', () => {
    const refs = [c(0, 0, 1), c(5, 0, 1), c(10, 0, 1)]
    const preds = [c(0.3, 0, 1), c(5.5, 0, 1), c(10.7, 0, 1)]
    for (const kind of ['greedy', 'hungarian'] as const) {
      const stats = computePQ(refs, preds, 1e-6, kind)
      const sortedIous = stats.matchedPairs
        .map((p) => p.iou)
        .sort((a, b) => a - b)
      const curve = computeSortedAPCurve(refs, preds, kind)
      // First point at threshold 0; subsequent points at the sorted IoUs.
      expect(curve[0].threshold).toBe(0)
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i].threshold).toBeCloseTo(sortedIous[i - 1], 12)
      }
    }
  })

  it('matches the closed-form one-to-one formula for greedy and Hungarian', () => {
    // Old formula: AP_k = (TP0 - k) / (preds.length + FN0 + k)
    const refs = [c(0, 0, 1), c(5, 0, 1), c(10, 0, 1)]
    const preds = [c(0.3, 0, 1), c(5.5, 0, 1), c(10.7, 0, 1), c(20, 20, 1)]
    for (const kind of ['greedy', 'hungarian'] as const) {
      const stats = computePQ(refs, preds, 1e-6, kind)
      const TP0 = stats.tp
      const FN0 = stats.fn
      const N = preds.length
      const ious = stats.matchedPairs
        .map((p) => p.iou)
        .sort((a, b) => a - b)
      const expected = [
        { threshold: 0, ap: TP0 / (N + FN0) },
        ...ious.map((iou, k) => ({
          threshold: iou,
          ap: (TP0 - (k + 1)) / (N + FN0 + (k + 1)),
        })),
      ]
      const curve = computeSortedAPCurve(refs, preds, kind)
      expect(curve.length).toBe(expected.length)
      for (let i = 0; i < expected.length; i++) {
        expect(curve[i].threshold).toBeCloseTo(expected[i].threshold, 12)
        expect(curve[i].ap).toBeCloseTo(expected[i].ap, 12)
      }
    }
  })

  it('maximize-merge: AP recurrence accounts for predIdxs.length when merges drop', () => {
    // Two preds merged into one ref + one unmatched ref.
    //   ref 0 absorbs preds 0 and 1 (merged IoU = M, where M < 1).
    //   ref 1 has no match.
    //   Total preds = 2, total refs = 2.
    //
    // Initial state (t=0): tp=1, fp=0, fn=1 → AP = 1 / 2 = 0.5
    // After raising past M: the merge drops, so:
    //   tp = 0
    //   fp += 2 (both preds released)
    //   fn += 1 → fn = 2
    //   AP = 0 / (0+2+2) = 0
    const refs = [c(0, 0, 2), c(20, 0, 1)]
    const preds = [c(-0.6, 0, 1), c(0.6, 0, 1)]
    const stats = computePQ(refs, preds, 1e-6, 'maximize-merge')
    expect(stats.tp).toBe(1)
    expect(stats.fp).toBe(0)
    expect(stats.fn).toBe(1)
    const M = stats.mergedMatches[0].iou
    const curve = computeSortedAPCurve(refs, preds, 'maximize-merge')
    expect(curve.length).toBe(2)
    expect(curve[0]).toEqual({ threshold: 0, ap: 1 / 2 })
    expect(curve[1].threshold).toBeCloseTo(M, 12)
    expect(curve[1].ap).toBeCloseTo(0, 12)
  })

  it('maximize-merge: dropping a 2-pred merge raises FP by 2, not 1', () => {
    // Two refs each merging exactly one pred (so behaves like one-to-one), plus
    // a separate ref absorbing two preds (a real merge). Verify the running
    // counters in the SortedAP curve respect the c_k = predIdxs.length release.
    //
    // Construction:
    //   ref 0 perfect-matched by pred 0 (IoU = 1)
    //   ref 1 absorbs preds 1 and 2 (merge of two), merged IoU = M
    //   No other refs/preds.
    //
    // At t=0: tp=2, fp=0, fn=0 → AP = 2/2 = 1
    // After dropping the smaller IoU (M, since M < 1):
    //   tp=1, fp += 2 (both merged preds released), fn += 1 → fp=2, fn=1
    //   AP = 1 / (1+2+1) = 1/4
    // After dropping the next (IoU = 1):
    //   tp=0, fp += 1 (pred 0 released), fn += 1 → fp=3, fn=2
    //   AP = 0 / 5 = 0
    const refs = [c(0, 0, 1), c(20, 0, 2)]
    const preds = [c(0, 0, 1), c(20 - 0.6, 0, 1), c(20 + 0.6, 0, 1)]
    const stats = computePQ(refs, preds, 1e-6, 'maximize-merge')
    expect(stats.tp).toBe(2)
    expect(stats.fp).toBe(0)
    expect(stats.fn).toBe(0)
    const m1 = stats.mergedMatches.find((m) => m.refIdx === 1)!
    expect(m1.predIdxs.sort()).toEqual([1, 2])
    const M = m1.iou
    expect(M).toBeLessThan(1) // sanity: not a perfect merge
    const curve = computeSortedAPCurve(refs, preds, 'maximize-merge')
    expect(curve[0]).toEqual({ threshold: 0, ap: 1 })
    // The first drop is the merge (smaller IoU).
    expect(curve[1].threshold).toBeCloseTo(M, 12)
    expect(curve[1].ap).toBeCloseTo(1 / 4, 12)
    expect(curve[2].threshold).toBeCloseTo(1, 12)
    expect(curve[2].ap).toBeCloseTo(0, 12)
  })
})

describe('computeSortedAP', () => {
  it('returns 0 for an empty curve', () => {
    expect(computeSortedAP([])).toBe(0)
  })

  it('returns 0 when the curve is flat at zero', () => {
    expect(computeSortedAP([{ threshold: 0, ap: 0 }])).toBe(0)
  })

  it('integrates a constant AP=1 step from 0 to 1 to value 1', () => {
    // A curve like a perfect match scenario: AP=1 for all t up to 1.0.
    expect(
      computeSortedAP([
        { threshold: 0, ap: 1 },
        { threshold: 1, ap: 0 },
      ]),
    ).toBeCloseTo(1, 12)
  })

  it('integrates a known step function correctly', () => {
    // Step function: AP = 0.5 on [0, 0.4); AP = 0.25 on [0.4, 0.8); AP = 0 on [0.8, 1].
    // Area = 0.4*0.5 + 0.4*0.25 + 0.2*0 = 0.2 + 0.1 + 0 = 0.3
    expect(
      computeSortedAP([
        { threshold: 0, ap: 0.5 },
        { threshold: 0.4, ap: 0.25 },
        { threshold: 0.8, ap: 0 },
      ]),
    ).toBeCloseTo(0.3, 12)
  })

  it('SortedAP value equals area under the curve from computeSortedAPCurve', () => {
    const refs = [c(0, 0, 1), c(5, 0, 1), c(10, 0, 1)]
    const preds = [c(0.3, 0, 1), c(5.5, 0, 1), c(10.7, 0, 1)]
    const curve = computeSortedAPCurve(refs, preds, 'greedy')
    const value = computeSortedAP(curve)
    // Manually sum step areas
    let expected = 0
    for (let i = 0; i < curve.length - 1; i++) {
      expected += (curve[i + 1].threshold - curve[i].threshold) * curve[i].ap
    }
    const last = curve[curve.length - 1]
    expected += (1 - last.threshold) * last.ap
    expect(value).toBeCloseTo(expected, 12)
  })

  it('is in [0, 1] for typical inputs', () => {
    const refs = [c(0, 0, 1), c(5, 0, 1)]
    const preds = [c(0.3, 0, 1), c(5.4, 0, 1), c(99, 99, 1)]
    for (const kind of ['greedy', 'hungarian', 'maximize-merge'] as const) {
      const v = computeSortedAP(computeSortedAPCurve(refs, preds, kind))
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('cross-matcher consistency', () => {
  it('on well-separated scenes, all three matchers agree on PQ', () => {
    const refs = [c(0, 0, 1), c(5, 0, 1), c(10, 0, 1)]
    const preds = [c(0.05, 0, 1), c(5.05, 0, 1), c(10.05, 0, 1)]
    const greedy = computePQ(refs, preds, 0.5, 'greedy')
    const hungarian = computePQ(refs, preds, 0.5, 'hungarian')
    const merge = computePQ(refs, preds, 0.5, 'maximize-merge')
    expect(hungarian.pq).toBeCloseTo(greedy.pq, 12)
    expect(merge.pq).toBeCloseTo(greedy.pq, 12)
  })

  it('maximize-merge PQ ≥ greedy PQ on the canonical merge scenario', () => {
    // ref radius 2 with two side-by-side unit preds. Merging is strictly better.
    const refs = [c(0, 0, 2)]
    const preds = [c(-0.6, 0, 1), c(0.6, 0, 1)]
    const greedy = computePQ(refs, preds, 0.0001, 'greedy')
    const merge = computePQ(refs, preds, 0.0001, 'maximize-merge')
    expect(merge.pq).toBeGreaterThan(greedy.pq)
  })
})
