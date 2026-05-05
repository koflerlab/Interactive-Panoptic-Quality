import { type Circle, circleIoU } from './geometry'
import {
  match,
  type MatchedPair,
  type MatcherKind,
  type MergedMatch,
} from './matchers'

export type { MatchedPair, MatcherKind, MergedMatch } from './matchers'

export type PQStats = {
  tp: number
  fp: number
  fn: number
  sq: number
  rq: number
  pq: number
  mergedMatches: MergedMatch[]
  matchedPairs: MatchedPair[]
}

export type CurvePoint = {
  threshold: number
  pq: number
  sq: number
  rq: number
  tp: number
}

export type SortedAPPoint = { threshold: number; ap: number }

export type ThresholdMode = 'discrete' | 'scene'

export function computePQ(
  refs: Circle[],
  preds: Circle[],
  threshold: number,
  matcher: MatcherKind = 'greedy',
): PQStats {
  const mergedMatches = match(refs, preds, threshold, matcher)
  const matchedPredCount = mergedMatches.reduce(
    (s, m) => s + m.predIdxs.length,
    0,
  )
  const tp = mergedMatches.length
  const fp = preds.length - matchedPredCount
  const fn = refs.length - tp
  const sq =
    tp === 0 ? 0 : mergedMatches.reduce((s, m) => s + m.iou, 0) / tp
  const rq = tp === 0 ? 0 : tp / (tp + 0.5 * fp + 0.5 * fn)
  const pq = sq * rq
  const matchedPairs: MatchedPair[] = mergedMatches.flatMap((m) =>
    m.predIdxs.map((j) => ({ refIdx: m.refIdx, predIdx: j, iou: m.iou })),
  )
  return { tp, fp, fn, sq, rq, pq, mergedMatches, matchedPairs }
}

export function defaultThresholds(step = 0.05): number[] {
  const out: number[] = []
  for (let t = step; t <= 1 + 1e-9; t += step) {
    out.push(Math.round(t * 1e5) / 1e5)
  }
  if (out[out.length - 1] > 1) out[out.length - 1] = 1
  return out
}

export function sceneThresholds(refs: Circle[], preds: Circle[]): number[] {
  const set = new Set<number>()
  set.add(0)
  set.add(1)
  for (let i = 0; i < refs.length; i++) {
    for (let j = 0; j < preds.length; j++) {
      const iou = circleIoU(refs[i], preds[j])
      if (iou > 0 && iou < 1) set.add(iou)
    }
  }
  return [...set].sort((a, b) => a - b)
}

export function computeCurve(
  refs: Circle[],
  preds: Circle[],
  thresholds: number[] = defaultThresholds(),
  matcher: MatcherKind = 'greedy',
): CurvePoint[] {
  return thresholds.map((t) => {
    const s = computePQ(refs, preds, t, matcher)
    return { threshold: t, pq: s.pq, sq: s.sq, rq: s.rq, tp: s.tp }
  })
}

export function computeAUTC(
  curve: CurvePoint[],
  pick: (p: CurvePoint) => number = (p) => p.pq,
): number {
  if (curve.length < 2) return 0
  const xs = [0, ...curve.map((c) => c.threshold)]
  const ys = [pick(curve[0]), ...curve.map(pick)]
  let area = 0
  for (let i = 0; i < xs.length - 1; i++) {
    area += (xs[i + 1] - xs[i]) * (ys[i] + ys[i + 1]) * 0.5
  }
  return area
}

export function computeAUTCStep(
  curve: CurvePoint[],
  pick: (p: CurvePoint) => number = (p) => p.pq,
): number {
  if (curve.length < 2) return 0
  let area = 0
  for (let i = 0; i < curve.length - 1; i++) {
    area += (curve[i + 1].threshold - curve[i].threshold) * pick(curve[i + 1])
  }
  return area
}

export function computeSortedAPCurve(
  refs: Circle[],
  preds: Circle[],
  matcher: MatcherKind = 'greedy',
): SortedAPPoint[] {
  const FUZZ = 1e-6
  const stats = computePQ(refs, preds, FUZZ, matcher)
  if (stats.mergedMatches.length === 0) return [{ threshold: 0, ap: 0 }]
  const sorted = [...stats.mergedMatches].sort((a, b) => a.iou - b.iou)
  let tp = stats.tp
  let fp = stats.fp
  let fn = stats.fn
  const denom0 = tp + fp + fn
  const points: SortedAPPoint[] = [
    { threshold: 0, ap: denom0 === 0 ? 0 : tp / denom0 },
  ]
  for (const m of sorted) {
    tp -= 1
    fp += m.predIdxs.length
    fn += 1
    const denom = tp + fp + fn
    points.push({
      threshold: m.iou,
      ap: denom === 0 ? 0 : tp / denom,
    })
  }
  return points
}

export function computeSortedAP(curve: SortedAPPoint[]): number {
  if (curve.length === 0) return 0
  let area = 0
  for (let i = 0; i < curve.length - 1; i++) {
    area += (curve[i + 1].threshold - curve[i].threshold) * curve[i].ap
  }
  const last = curve[curve.length - 1]
  area += (1 - last.threshold) * last.ap
  return area
}
