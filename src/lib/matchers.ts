import { type Circle, circleIoU, mergedIoU } from './geometry'
import { linearSumAssignment } from './hungarian'

export type MatchedPair = { refIdx: number; predIdx: number; iou: number }

export type MergedMatch = {
  refIdx: number
  predIdxs: number[]
  iou: number
}

export type MatcherKind = 'greedy' | 'hungarian' | 'maximize-merge'

export const MATCHER_LABELS: Record<MatcherKind, string> = {
  greedy: 'Greedy',
  hungarian: 'Hungarian',
  'maximize-merge': 'Maximize merge',
}

type Pair = { refIdx: number; predIdx: number; iou: number }

function iouPairs(refs: Circle[], preds: Circle[]): Pair[] {
  const pairs: Pair[] = []
  for (let i = 0; i < refs.length; i++) {
    for (let j = 0; j < preds.length; j++) {
      const iou = circleIoU(refs[i], preds[j])
      if (iou > 0) pairs.push({ refIdx: i, predIdx: j, iou })
    }
  }
  pairs.sort((a, b) => b.iou - a.iou)
  return pairs
}

function matchGreedy(
  refs: Circle[],
  preds: Circle[],
  threshold: number,
): MergedMatch[] {
  const pairs = iouPairs(refs, preds)
  const matchedRef = new Set<number>()
  const matchedPred = new Set<number>()
  const out: MergedMatch[] = []
  for (const p of pairs) {
    if (p.iou <= threshold) break
    if (matchedRef.has(p.refIdx) || matchedPred.has(p.predIdx)) continue
    matchedRef.add(p.refIdx)
    matchedPred.add(p.predIdx)
    out.push({ refIdx: p.refIdx, predIdxs: [p.predIdx], iou: p.iou })
  }
  return out
}

function matchHungarian(
  refs: Circle[],
  preds: Circle[],
  threshold: number,
): MergedMatch[] {
  const n = refs.length
  const m = preds.length
  if (n === 0 || m === 0) return []

  const SMALL = 1e-6
  const DEFAULT_COST = 1.0 + SMALL
  const cost: number[][] = []
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(m).fill(DEFAULT_COST)
    for (let j = 0; j < m; j++) {
      const iou = circleIoU(refs[i], preds[j])
      if (iou > 0 && iou > threshold) row[j] = 1 - iou
    }
    cost.push(row)
  }

  const { rowInd, colInd } = linearSumAssignment(cost)
  const out: MergedMatch[] = []
  for (let k = 0; k < rowInd.length; k++) {
    const i = rowInd[k]
    const j = colInd[k]
    if (cost[i][j] < 1.0) {
      out.push({ refIdx: i, predIdxs: [j], iou: 1 - cost[i][j] })
    }
  }
  return out
}

function matchMaximizeMerge(
  refs: Circle[],
  preds: Circle[],
  threshold: number,
): MergedMatch[] {
  const pairs = iouPairs(refs, preds)
  const merges = new Map<number, { predIdxs: number[]; iou: number }>()
  const matchedPred = new Set<number>()

  for (const p of pairs) {
    if (matchedPred.has(p.predIdx)) continue
    const existing = merges.get(p.refIdx)
    if (existing) {
      const candidatePreds = [...existing.predIdxs, p.predIdx].map(
        (j) => preds[j],
      )
      const newIoU = mergedIoU(candidatePreds, refs[p.refIdx])
      if (newIoU > existing.iou) {
        existing.predIdxs.push(p.predIdx)
        existing.iou = newIoU
        matchedPred.add(p.predIdx)
      }
    } else if (p.iou > threshold) {
      merges.set(p.refIdx, { predIdxs: [p.predIdx], iou: p.iou })
      matchedPred.add(p.predIdx)
    }
  }

  return [...merges.entries()].map(([refIdx, v]) => ({
    refIdx,
    predIdxs: v.predIdxs,
    iou: v.iou,
  }))
}

export function match(
  refs: Circle[],
  preds: Circle[],
  threshold: number,
  kind: MatcherKind,
): MergedMatch[] {
  if (kind === 'hungarian') return matchHungarian(refs, preds, threshold)
  if (kind === 'maximize-merge')
    return matchMaximizeMerge(refs, preds, threshold)
  return matchGreedy(refs, preds, threshold)
}
