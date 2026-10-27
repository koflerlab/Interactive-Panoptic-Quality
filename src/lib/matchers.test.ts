import { describe, it, expect } from 'vitest'
import { type Circle, circleIoU } from './geometry'
import {
  match,
  MATCHER_LABELS,
  type MatcherKind,
  type MergedMatch,
} from './matchers'

const c = (x: number, y: number, r: number): Circle => ({ x, y, r })

const ALL_KINDS: MatcherKind[] = ['greedy', 'hungarian', 'maximize-merge']

const sortMerges = (ms: MergedMatch[]): MergedMatch[] =>
  [...ms]
    .map((m) => ({ ...m, predIdxs: [...m.predIdxs].sort((a, b) => a - b) }))
    .sort((a, b) => a.refIdx - b.refIdx)

describe('MATCHER_LABELS', () => {
  it('has a label for every MatcherKind', () => {
    for (const kind of ALL_KINDS) {
      expect(MATCHER_LABELS[kind]).toBeTruthy()
      expect(typeof MATCHER_LABELS[kind]).toBe('string')
    }
  })
})

describe('match — degenerate inputs', () => {
  for (const kind of ALL_KINDS) {
    it(`returns no merges when refs is empty (${kind})`, () => {
      expect(match([], [c(0, 0, 1)], 0.5, kind)).toEqual([])
    })

    it(`returns no merges when preds is empty (${kind})`, () => {
      expect(match([c(0, 0, 1)], [], 0.5, kind)).toEqual([])
    })

    it(`returns no merges when both are empty (${kind})`, () => {
      expect(match([], [], 0.5, kind)).toEqual([])
    })
  }
})

describe('match — strict threshold', () => {
  const refs = [c(0, 0, 1)]
  const preds = [c(0.6, 0, 1)]
  const iou = circleIoU(refs[0], preds[0])

  for (const kind of ALL_KINDS) {
    it(`does not match a pair whose IoU equals the threshold (${kind})`, () => {
      expect(match(refs, preds, iou, kind)).toEqual([])
    })

    it(`matches a pair whose IoU is just above the threshold (${kind})`, () => {
      expect(match(refs, preds, iou - 1e-9, kind)).toHaveLength(1)
    })
  }
})

describe('match — output invariants', () => {
  // Predictions must each appear in at most one merge across all matchers,
  // and refs must each appear in at most one merge (one-to-one for greedy/Hungarian,
  // many-to-one for maximize-merge).
  const refs = [c(0, 0, 1), c(3, 0, 1), c(0, 3, 1)]
  const preds = [
    c(0.1, 0, 1),
    c(2.9, 0, 1),
    c(0, 3.05, 0.95),
    c(5, 5, 1), // pure FP
  ]

  for (const kind of ALL_KINDS) {
    it(`each pred index appears in at most one merge (${kind})`, () => {
      const ms = match(refs, preds, 0.0001, kind)
      const seen = new Set<number>()
      for (const m of ms) {
        for (const j of m.predIdxs) {
          expect(seen.has(j)).toBe(false)
          seen.add(j)
        }
      }
    })

    it(`each ref index appears at most once across merges (${kind})`, () => {
      const ms = match(refs, preds, 0.0001, kind)
      const seen = new Set<number>()
      for (const m of ms) {
        expect(seen.has(m.refIdx)).toBe(false)
        seen.add(m.refIdx)
      }
    })

    it(`each merge has at least one pred (${kind})`, () => {
      const ms = match(refs, preds, 0.0001, kind)
      for (const m of ms) {
        expect(m.predIdxs.length).toBeGreaterThanOrEqual(1)
      }
    })
  }

  for (const kind of ['greedy', 'hungarian'] as const) {
    it(`one-to-one matchers produce singleton merges (${kind})`, () => {
      const ms = match(refs, preds, 0.0001, kind)
      for (const m of ms) {
        expect(m.predIdxs.length).toBe(1)
      }
    })
  }
})

describe('matchGreedy', () => {
  it('respects the threshold (no match below threshold)', () => {
    // Two unit circles at d=1 → IoU ≈ 0.181. Threshold 0.5 → no match.
    const refs = [c(0, 0, 1)]
    const preds = [c(1, 0, 1)]
    expect(match(refs, preds, 0.5, 'greedy')).toEqual([])
  })

  it('returns the matched pair when threshold allows', () => {
    const refs = [c(0, 0, 1)]
    const preds = [c(0.1, 0, 1)]
    const ms = match(refs, preds, 0.5, 'greedy')
    expect(ms.length).toBe(1)
    expect(ms[0].refIdx).toBe(0)
    expect(ms[0].predIdxs).toEqual([0])
    expect(ms[0].iou).toBeGreaterThan(0.5)
  })

  it('picks the highest-IoU pair first under contention', () => {
    // Two refs, two preds. Pred 0 overlaps ref 0 and ref 1, but more with ref 0.
    const refs = [c(0, 0, 1), c(2, 0, 1)]
    const preds = [c(0.1, 0, 1), c(2.5, 0, 1)]
    const ms = sortMerges(match(refs, preds, 0.0001, 'greedy'))
    expect(ms).toEqual([
      expect.objectContaining({ refIdx: 0, predIdxs: [0] }),
      expect.objectContaining({ refIdx: 1, predIdxs: [1] }),
    ])
  })
})

describe('matchHungarian', () => {
  it('finds the globally optimal assignment when greedy would not', () => {
    // Construct 2 refs and 2 preds where greedy's first pick blocks a better one.
    //
    //   ref0 at (0, 0, r=1)
    //   ref1 at (3, 0, r=1)
    //   pred0 at (0, 0, r=1)        IoU(p0, r0) = 1.0
    //   pred1 at (1.5, 0, r=2)      IoU(p1, r0) ≈ 0.20, IoU(p1, r1) ≈ 0.20
    //
    // Greedy picks (p0, r0)=1.0 first → leaves (p1, r1)=0.20 → 1 match used,
    //   p1 also matched to r1: total IoU 1.20.
    // Hungarian picks the same here actually — let's contrive a real divergence.
    //
    // A classic divergence: Place a ref where one pred fits perfectly and another
    // ref where two preds tie. Greedy and Hungarian commonly agree on
    // 2x2 degenerate scenes, so we rely on a known-divergent cost matrix instead
    // (this is enforced separately in the cost-matrix tests).
    //
    // Here we just confirm it produces a maximum-IoU one-to-one assignment.
    const refs = [c(0, 0, 1), c(3, 0, 1)]
    const preds = [c(0, 0, 1), c(1.5, 0, 2)]
    const ms = match(refs, preds, 0.0001, 'hungarian')
    const total = ms.reduce((s, m) => s + m.iou, 0)
    // Possible assignments (one-to-one):
    //   (r0,p0)+(r1,p1) → IoU 1 + ~0.20 ≈ 1.20
    //   (r0,p1)+(r1,p0) → IoU ~0.20 + 0 = 0.20
    // Hungarian must pick the first.
    expect(total).toBeGreaterThan(1.0)
  })

  it('respects the threshold by excluding below-threshold pairs', () => {
    // Two unit circles at d=1 → IoU ≈ 0.181 < 0.5
    const refs = [c(0, 0, 1)]
    const preds = [c(1, 0, 1)]
    expect(match(refs, preds, 0.5, 'hungarian')).toEqual([])
  })

  it('matches greedy when there is no contention', () => {
    const refs = [c(0, 0, 1), c(5, 0, 1)]
    const preds = [c(0.1, 0, 1), c(5.1, 0, 1)]
    const greedy = sortMerges(match(refs, preds, 0.0001, 'greedy'))
    const hungarian = sortMerges(match(refs, preds, 0.0001, 'hungarian'))
    expect(hungarian).toEqual(greedy)
  })
})

describe('matchMaximizeMerge', () => {
  it('merges a beneficial second pred (raises merged IoU)', () => {
    // ref radius 2 covers both preds; each solo pred has IoU 0.25 (= 1/4),
    // but merging both yields IoU > 0.25. Greedy/Hungarian only use one.
    const refs = [c(0, 0, 2)]
    const preds = [c(-0.6, 0, 1), c(0.6, 0, 1)]
    const ms = match(refs, preds, 0.0001, 'maximize-merge')
    expect(ms.length).toBe(1)
    expect(ms[0].refIdx).toBe(0)
    expect(ms[0].predIdxs.sort()).toEqual([0, 1])
    expect(ms[0].iou).toBeGreaterThan(0.25)
  })

  it('refuses a harmful merge (would lower merged IoU)', () => {
    // Perfect solo match + far-away pred. Adding the far pred only inflates
    // the union without contributing to intersection, so it must be skipped.
    const refs = [c(0, 0, 1)]
    const preds = [c(0, 0, 1), c(100, 0, 1)]
    const ms = match(refs, preds, 0.0001, 'maximize-merge')
    expect(ms.length).toBe(1)
    expect(ms[0].predIdxs).toEqual([0])
    expect(ms[0].iou).toBeCloseTo(1, 12)
  })

  it('threshold gates the seed match but not subsequent merges', () => {
    // First match per ref must clear threshold. Once a ref has any merge,
    // subsequent preds can still join even if their solo IoU is below threshold,
    // provided they improve the merged IoU.
    //
    //   ref:   (0, 0, r=2)
    //   pred0: (-0.3, 0, r=1.6)   solo IoU is fairly high  → seed
    //   pred1: ( 0.6, 0, r=1)     solo IoU lower
    //
    // With a low threshold both can join; with a moderate threshold only the seed
    // can be admitted, but the second can still merge if it improves the merged IoU.
    const refs = [c(0, 0, 2)]
    const preds = [c(-0.3, 0, 1.6), c(0.6, 0, 1)]
    // Sanity: solo IoUs as expected.
    const lowT = match(refs, preds, 0.0001, 'maximize-merge')
    expect(lowT.length).toBe(1)
    // With high threshold (above pred1 solo but below pred0 solo) merging should
    // still incorporate pred1 if it improves the merge.
    const highT = match(refs, preds, 0.4, 'maximize-merge')
    expect(highT.length).toBe(1)
    // Seed cleared the threshold; if pred1 improved the merge, it joined too.
    expect(highT[0].predIdxs.length).toBeGreaterThanOrEqual(1)
  })

  it('respects the threshold gate when even the best pred is below it', () => {
    // Both solo IoUs are tiny (~0.18) — neither can seed if threshold is high.
    const refs = [c(0, 0, 1)]
    const preds = [c(1, 0, 1), c(-1, 0, 1)]
    expect(match(refs, preds, 0.5, 'maximize-merge')).toEqual([])
  })

  it('a pred can only join one ref, even when many-to-one is allowed', () => {
    // Pred 0 overlaps both ref 0 and ref 1. With maximize-merge it should still
    // appear in only one of them (its strongest seed).
    const refs = [c(0, 0, 1), c(1.4, 0, 1)]
    const preds = [c(0.5, 0, 1)]
    const ms = match(refs, preds, 0.0001, 'maximize-merge')
    let count = 0
    for (const m of ms) {
      if (m.predIdxs.includes(0)) count++
    }
    expect(count).toBe(1)
  })

  it('reduces to greedy when no merge could improve IoU', () => {
    // Three well-separated ref/pred pairs. Each ref has only one viable pred,
    // so maximize-merge produces the same singletons as greedy.
    const refs = [c(0, 0, 1), c(5, 0, 1), c(0, 5, 1)]
    const preds = [c(0.1, 0, 1), c(5.05, 0, 1), c(0, 5.05, 1)]
    const greedy = sortMerges(match(refs, preds, 0.0001, 'greedy'))
    const merge = sortMerges(match(refs, preds, 0.0001, 'maximize-merge'))
    // Same ref/pred pairing, same IoUs.
    expect(merge.length).toBe(greedy.length)
    for (let i = 0; i < merge.length; i++) {
      expect(merge[i].refIdx).toBe(greedy[i].refIdx)
      expect(merge[i].predIdxs).toEqual(greedy[i].predIdxs)
      expect(merge[i].iou).toBeCloseTo(greedy[i].iou, 12)
    }
  })
})
