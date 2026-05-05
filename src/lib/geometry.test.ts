import { describe, it, expect } from 'vitest'
import {
  type Circle,
  circleIoU,
  unionArea,
  mergedIoU,
  globalIoU,
} from './geometry'

const c = (x: number, y: number, r: number): Circle => ({
  x,
  y,
  r,
})

const TAU = 2 * Math.PI
const SQRT3 = Math.sqrt(3)
const EPS = 1e-9

describe('circleIoU', () => {
  it('returns 1 for identical circles', () => {
    expect(circleIoU(c(0, 0, 1), c(0, 0, 1))).toBeCloseTo(1, 12)
    expect(circleIoU(c(5, -3, 2.5), c(5, -3, 2.5))).toBeCloseTo(1, 12)
  })

  it('returns 0 for disjoint circles', () => {
    expect(circleIoU(c(0, 0, 1), c(3, 0, 1))).toBe(0)
    expect(circleIoU(c(0, 0, 1), c(2.001, 0, 1))).toBe(0)
  })

  it('returns 0 for externally tangent circles', () => {
    // d = r1 + r2 exactly: zero-area lens
    expect(circleIoU(c(0, 0, 1), c(2, 0, 1))).toBe(0)
  })

  it('returns (small/large)^2 for one circle fully inside another (concentric)', () => {
    expect(circleIoU(c(0, 0, 2), c(0, 0, 1))).toBeCloseTo(1 / 4, 12)
    expect(circleIoU(c(0, 0, 1), c(0, 0, 3))).toBeCloseTo(1 / 9, 12)
  })

  it('returns (small/large)^2 for internal tangent', () => {
    // small circle just inside the larger one, touching boundary at one point
    expect(circleIoU(c(0, 0, 2), c(1, 0, 1))).toBeCloseTo(1 / 4, 12)
  })

  it('is symmetric', () => {
    const a = c(0, 0, 1)
    const b = c(0.7, 0.3, 1.4)
    expect(circleIoU(a, b)).toBeCloseTo(circleIoU(b, a), 12)
  })

  it('matches the closed-form lens formula for partial overlap', () => {
    // Two unit circles at d=1: lens area = 2*acos(1/2) - sqrt(3)/2
    //                                    = 2π/3 - √3/2
    // Union = 2π - lens. IoU = lens / union.
    const lens = (2 * Math.PI) / 3 - SQRT3 / 2
    const union = 2 * Math.PI - lens
    const expected = lens / union
    expect(circleIoU(c(0, 0, 1), c(1, 0, 1))).toBeCloseTo(expected, 12)
  })

  it('agrees with itself across translations and rotations', () => {
    // The metric is purely a function of pair geometry; translating both circles
    // shouldn't change the IoU.
    const base = circleIoU(c(0, 0, 1), c(1.2, 0.4, 0.9))
    const shifted = circleIoU(c(10, -5, 1), c(11.2, -4.6, 0.9))
    expect(shifted).toBeCloseTo(base, 12)
  })
})

describe('unionArea — base cases', () => {
  it('returns 0 for an empty set', () => {
    expect(unionArea([])).toBe(0)
  })

  it('returns the disk area for a single circle', () => {
    expect(unionArea([c(0, 0, 1)])).toBeCloseTo(Math.PI, 12)
    expect(unionArea([c(7, -3, 2.5)])).toBeCloseTo(Math.PI * 6.25, 12)
  })

  it('returns the sum of disk areas for fully disjoint circles', () => {
    const u = unionArea([c(0, 0, 1), c(10, 0, 2), c(0, 10, 0.5)])
    expect(u).toBeCloseTo(Math.PI * (1 + 4 + 0.25), 12)
  })

  it('returns the same result regardless of input order', () => {
    const a = c(0, 0, 1)
    const b = c(1, 0, 1)
    const cc = c(0.5, SQRT3 / 2, 1)
    const u1 = unionArea([a, b, cc])
    const u2 = unionArea([cc, b, a])
    const u3 = unionArea([b, a, cc])
    expect(u2).toBeCloseTo(u1, 12)
    expect(u3).toBeCloseTo(u1, 12)
  })
})

describe('unionArea — overlap and containment', () => {
  it('two identical circles count once', () => {
    expect(unionArea([c(0, 0, 1), c(0, 0, 1)])).toBeCloseTo(Math.PI, 12)
  })

  it('larger circle fully containing smaller returns the larger disk', () => {
    expect(unionArea([c(0, 0, 2), c(0, 0, 1)])).toBeCloseTo(4 * Math.PI, 12)
    expect(unionArea([c(0, 0, 1), c(0, 0, 2)])).toBeCloseTo(4 * Math.PI, 12)
    // Off-center but still contained:
    expect(unionArea([c(0, 0, 3), c(1, 1, 0.5)])).toBeCloseTo(9 * Math.PI, 12)
  })

  it('chain of fully-contained circles returns only the largest', () => {
    // r=3 contains r=2 contains r=1, all concentric.
    expect(
      unionArea([c(0, 0, 1), c(0, 0, 2), c(0, 0, 3)]),
    ).toBeCloseTo(9 * Math.PI, 12)
  })

  it('two equal-radius circles overlapping at d=1 → 4π/3 + √3/2', () => {
    expect(unionArea([c(0, 0, 1), c(1, 0, 1)])).toBeCloseTo(
      (4 * Math.PI) / 3 + SQRT3 / 2,
      12,
    )
  })

  it('externally tangent circles do not double-count the touch point', () => {
    expect(unionArea([c(0, 0, 1), c(2, 0, 1)])).toBeCloseTo(2 * Math.PI, 12)
  })

  it('internally tangent: small fully inside larger', () => {
    expect(unionArea([c(0, 0, 2), c(1, 0, 1)])).toBeCloseTo(4 * Math.PI, 12)
  })

  it('three equal-radius unit circles in equilateral configuration → 1.5π + √3', () => {
    // Reuleaux setup: side length 1, all radii 1.
    const a = c(0, 0, 1)
    const b = c(1, 0, 1)
    const cc = c(0.5, SQRT3 / 2, 1)
    expect(unionArea([a, b, cc])).toBeCloseTo(1.5 * Math.PI + SQRT3, 12)
  })

  it('many small circles inside one big circle return just the big circle', () => {
    const big = c(0, 0, 10)
    const smalls = Array.from({ length: 8 }, (_, i) =>
      c(Math.cos((i * TAU) / 8) * 5, Math.sin((i * TAU) / 8) * 5, 1),
    )
    expect(unionArea([big, ...smalls])).toBeCloseTo(100 * Math.PI, 9)
  })

  it('union >= every individual disk and >= every pairwise union', () => {
    const a = c(0, 0, 1.5)
    const b = c(1.2, 0.3, 1)
    const cc = c(-0.7, 0.9, 0.8)
    const total = unionArea([a, b, cc])
    expect(total).toBeGreaterThanOrEqual(Math.PI * a.r * a.r - EPS)
    expect(total).toBeGreaterThanOrEqual(unionArea([a, b]) - EPS)
    expect(total).toBeGreaterThanOrEqual(unionArea([a, cc]) - EPS)
    expect(total).toBeGreaterThanOrEqual(unionArea([b, cc]) - EPS)
  })

  it('two-circle union matches inclusion-exclusion via lens area', () => {
    // For two circles with radii r1, r2 at distance d (overlapping),
    // |A ∪ B| = πr1² + πr2² - lens(r1, r2, d).
    const r1 = 1.3
    const r2 = 1.1
    const d = 0.8
    // closed-form lens: r1² acos((d²+r1²−r2²)/(2dr1)) + r2² acos((d²+r2²−r1²)/(2dr2))
    //                   − ½ √((-d+r1+r2)(d+r1−r2)(d−r1+r2)(d+r1+r2))
    const term1 =
      r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1))
    const term2 =
      r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2))
    const term3 =
      0.5 *
      Math.sqrt(
        (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2),
      )
    const lens = term1 + term2 - term3
    const expected = Math.PI * (r1 * r1 + r2 * r2) - lens
    expect(unionArea([c(0, 0, r1), c(d, 0, r2)])).toBeCloseTo(expected, 12)
  })
})

describe('mergedIoU', () => {
  it('returns 0 for empty pred set', () => {
    expect(mergedIoU([], c(0, 0, 1))).toBe(0)
  })

  it('reduces to circleIoU for a singleton pred', () => {
    // Sweep many configurations including disjoint, contained, overlapping.
    for (let dx = 0; dx <= 4; dx += 0.37) {
      for (const rRef of [0.5, 1.0, 1.5]) {
        for (const rPred of [0.5, 1.0, 1.5]) {
          const ref = c(0, 0, rRef)
          const pred = c(dx, 0, rPred)
          expect(mergedIoU([pred], ref)).toBeCloseTo(circleIoU(pred, ref), 12)
        }
      }
    }
  })

  it('returns 1 when union of preds equals ref exactly (singleton identical)', () => {
    expect(mergedIoU([c(0, 0, 1)], c(0, 0, 1))).toBeCloseTo(1, 12)
  })

  it('returns 0 when no pred overlaps the ref', () => {
    expect(mergedIoU([c(10, 0, 1), c(20, 0, 1)], c(0, 0, 1))).toBe(0)
  })

  it('two preds covering opposite halves of a ref give the expected merged IoU', () => {
    // ref radius 2 at origin; two unit preds at (-0.6, 0) and (0.6, 0). Numerical baseline.
    const ref = c(0, 0, 2)
    const preds = [c(-0.6, 0, 1), c(0.6, 0, 1)]
    const m = mergedIoU(preds, ref)
    expect(m).toBeGreaterThan(0)
    expect(m).toBeLessThan(1)
    // Adding a useful second pred should improve IoU over the better solo:
    const solo = circleIoU(preds[0], ref)
    expect(m).toBeGreaterThan(solo)
  })

  it('order of preds does not affect the merged IoU', () => {
    const ref = c(0, 0, 2)
    const a = c(-0.6, 0, 1)
    const b = c(0.6, 0, 1)
    const cc = c(0.0, 1.0, 0.7)
    expect(mergedIoU([a, b, cc], ref)).toBeCloseTo(
      mergedIoU([cc, b, a], ref),
      12,
    )
  })

  it('adding a pred that lies entirely inside another pred does not change merged IoU', () => {
    const ref = c(0, 0, 1.5)
    const big = c(0, 0, 1)
    const tiny = c(0, 0, 0.3) // fully inside `big`
    const without = mergedIoU([big], ref)
    const withTiny = mergedIoU([big, tiny], ref)
    expect(withTiny).toBeCloseTo(without, 12)
  })

  it('adding a pred outside the ref always lowers (or keeps) the merged IoU', () => {
    // The far pred increases the union without contributing to the intersection,
    // so IoU can only decrease (or stay equal if it's already covered by a closer pred).
    const ref = c(0, 0, 1)
    const inside = c(0.1, 0, 1)
    const far = c(10, 0, 1)
    const before = mergedIoU([inside], ref)
    const after = mergedIoU([inside, far], ref)
    expect(after).toBeLessThanOrEqual(before + EPS)
  })
})

describe('globalIoU', () => {
  it('returns 0 when both sets are empty', () => {
    expect(globalIoU([], [])).toBe(0)
  })

  it('returns 0 when one set is empty', () => {
    expect(globalIoU([c(0, 0, 1)], [])).toBe(0)
    expect(globalIoU([], [c(0, 0, 1)])).toBe(0)
  })

  it('returns 1 for identical singleton sets', () => {
    expect(globalIoU([c(0, 0, 1)], [c(0, 0, 1)])).toBeCloseTo(1, 12)
  })

  it('returns 0 for fully disjoint sets', () => {
    expect(globalIoU([c(0, 0, 1)], [c(10, 0, 1)])).toBeCloseTo(0, 12)
  })

  it('matches circleIoU for singleton vs singleton', () => {
    const a = c(0, 0, 1)
    const b = c(1, 0, 1)
    expect(globalIoU([a], [b])).toBeCloseTo(circleIoU(a, b), 12)
  })

  it('is symmetric', () => {
    const refs = [c(0, 0, 1), c(2, 0, 1)]
    const preds = [c(0.5, 0.2, 1.2)]
    expect(globalIoU(refs, preds)).toBeCloseTo(globalIoU(preds, refs), 12)
  })

  it('returns a value in [0, 1]', () => {
    const refs = [c(0, 0, 1), c(1.5, 0, 1)]
    const preds = [c(0.7, 0.3, 1), c(3, 0, 0.5)]
    const v = globalIoU(refs, preds)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThanOrEqual(1)
  })
})
