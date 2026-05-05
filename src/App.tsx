import { useEffect, useMemo, useState } from 'react'
import { Scene, type PredStatus, type RefStatus } from './components/Scene'
import { OffsetSlider } from './components/OffsetSlider'
import { CurveChart } from './components/CurveChart'
import { CalcReadout } from './components/CalcReadout'
import { DEFAULT_PREDS, DEFAULT_REFS } from './lib/scene'
import {
  computeAUTC,
  computeAUTCStep,
  computeCurve,
  computePQ,
  computeSortedAP,
  computeSortedAPCurve,
  sceneThresholds,
  type ThresholdMode,
} from './lib/metrics'
import { MATCHER_LABELS, type MatcherKind } from './lib/matchers'
import { globalIoU, type Circle } from './lib/geometry'
import { Legend } from './components/Legend'
import {
  parseSceneState,
  serializeSceneState,
  type SceneState,
} from './lib/urlState'

const DEFAULT_STATE: SceneState = {
  refs: DEFAULT_REFS,
  preds: DEFAULT_PREDS,
  matcher: 'greedy',
  thresholdMode: 'scene',
  showSortedAp: false,
  showAutc: true,
  showAutcSq: true,
  showAutcRq: true,
}

const initialState: SceneState =
  typeof window === 'undefined'
    ? DEFAULT_STATE
    : parseSceneState(window.location.search, DEFAULT_STATE)

const middleThreshold = (thresholds: number[]): number | null => {
  if (thresholds.length === 0) return null
  return thresholds[Math.floor(thresholds.length / 2)]
}

const initialPinnedThreshold: number | null = middleThreshold(
  sceneThresholds(initialState.refs, initialState.preds),
)

export const App = () => {
  const [refs, setRefs] = useState<Circle[]>(initialState.refs)
  const [preds, setPreds] = useState<Circle[]>(initialState.preds)
  const [offset, setOffset] = useState(0)
  const [hoverThreshold, setHoverThreshold] = useState<number | null>(null)
  const [pinnedThreshold, setPinnedThreshold] = useState<number | null>(
    initialPinnedThreshold,
  )
  const [thresholdMode, setThresholdMode] = useState<ThresholdMode>(
    initialState.thresholdMode,
  )
  const [matcherKind, setMatcherKind] = useState<MatcherKind>(
    initialState.matcher,
  )
  const [showSortedAp, setShowSortedAp] = useState(initialState.showSortedAp)
  const [showAutc, setShowAutc] = useState(initialState.showAutc)
  const [showAutcSq, setShowAutcSq] = useState(initialState.showAutcSq)
  const [showAutcRq, setShowAutcRq] = useState(initialState.showAutcRq)
  const [hasEverPinned, setHasEverPinned] = useState(
    initialPinnedThreshold !== null,
  )
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (isDragging) return
    const params = serializeSceneState({
      refs,
      preds,
      matcher: matcherKind,
      thresholdMode,
      showSortedAp,
      showAutc,
      showAutcSq,
      showAutcRq,
    })
    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`
    window.history.replaceState(null, '', newUrl)
  }, [
    refs,
    preds,
    matcherKind,
    thresholdMode,
    showSortedAp,
    showAutc,
    showAutcSq,
    showAutcRq,
    isDragging,
  ])

  const effectivePreds = useMemo(
    () => preds.map((c) => ({ ...c, x: c.x + offset })),
    [preds, offset],
  )
  const thresholds = useMemo(
    () =>
      thresholdMode === 'scene'
        ? sceneThresholds(refs, effectivePreds)
        : undefined,
    [thresholdMode, refs, effectivePreds],
  )
  const curve = useMemo(
    () => computeCurve(refs, effectivePreds, thresholds, matcherKind),
    [refs, effectivePreds, thresholds, matcherKind],
  )
  const autc = useMemo(
    () => (thresholdMode === 'scene' ? computeAUTCStep(curve) : computeAUTC(curve)),
    [thresholdMode, curve],
  )
  const autcSq = useMemo(
    () =>
      thresholdMode === 'scene'
        ? computeAUTCStep(curve, (p) => p.sq)
        : computeAUTC(curve, (p) => p.sq),
    [thresholdMode, curve],
  )
  const autcRq = useMemo(
    () =>
      thresholdMode === 'scene'
        ? computeAUTCStep(curve, (p) => p.rq)
        : computeAUTC(curve, (p) => p.rq),
    [thresholdMode, curve],
  )
  const sortedApCurve = useMemo(
    () => computeSortedAPCurve(refs, effectivePreds, matcherKind),
    [refs, effectivePreds, matcherKind],
  )
  const sortedAp = useMemo(
    () => computeSortedAP(sortedApCurve),
    [sortedApCurve],
  )
  const gIoU = useMemo(
    () => globalIoU(refs, effectivePreds),
    [refs, effectivePreds],
  )

  const activeThreshold = hoverThreshold ?? pinnedThreshold
  const activeSource: 'hover' | 'pinned' | null =
    hoverThreshold !== null ? 'hover' : pinnedThreshold !== null ? 'pinned' : null

  const activeStats = useMemo(
    () =>
      activeThreshold === null
        ? null
        : computePQ(refs, effectivePreds, activeThreshold, matcherKind),
    [refs, effectivePreds, activeThreshold, matcherKind],
  )

  const { refStatuses, predStatuses } = useMemo(() => {
    if (!activeStats) {
      return {
        refStatuses: undefined,
        predStatuses: undefined,
      }
    }
    const matchedRef = new Set(activeStats.matchedPairs.map((p) => p.refIdx))
    const matchedPred = new Set(activeStats.matchedPairs.map((p) => p.predIdx))
    return {
      refStatuses: refs.map<RefStatus>((_, i) =>
        matchedRef.has(i) ? 'TP' : 'FN',
      ),
      predStatuses: preds.map<PredStatus>((_, i) =>
        matchedPred.has(i) ? 'TP' : 'FP',
      ),
    }
  }, [activeStats, refs, preds])

  const handleReset = () => {
    setRefs(DEFAULT_REFS)
    setPreds(DEFAULT_PREDS)
    setOffset(0)
    setPinnedThreshold(null)
    setHoverThreshold(null)
  }

  return (
    <div className="min-h-screen bg-base-200 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className='text-xl mb-2'>Interactive Panoptic Quality</h1>
            <p className="text-sm">
              An interactive demo of Panoptic Quality. Edit the scene, pick a matcher, share the URL.
            </p>
          </div>
          <a
            href="https://github.com/ErikGro/AUTC-Interactive"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            className="btn btn-ghost btn-circle shrink-0"
          >
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor">
              <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.01-.02-1.98-3.2.69-3.87-1.54-3.87-1.54-.53-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18.92-.26 1.9-.39 2.88-.39.98 0 1.96.13 2.88.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.08 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.07.78 2.16 0 1.56-.01 2.81-.01 3.2 0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.73 18.27.5 12 .5z" />
            </svg>
          </a>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col">
            <Legend hasActiveThreshold={activeThreshold != null} />
            <Scene
              refs={refs}
              preds={preds}
              offset={offset}
              refStatuses={refStatuses}
              predStatuses={predStatuses}
              onRefsChange={setRefs}
              onPredsChange={setPreds}
              onDraggingChange={setIsDragging}
            />
            <OffsetSlider value={offset} onChange={setOffset} />
            <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs shrink-0 hidden sm:inline">
                  Matching Algorithm
                </label>
                <div
                  role="radiogroup"
                  aria-label="Matching algorithm"
                  className="join"
                >
                  {(Object.keys(MATCHER_LABELS) as MatcherKind[]).map((kind) => (
                    <button
                      key={kind}
                      role="radio"
                      aria-checked={matcherKind === kind}
                      className={`join-item btn btn-xs sm:btn-sm ${matcherKind === kind ? 'btn-active btn-primary' : 'btn-soft'
                        }`}
                      onClick={() => setMatcherKind(kind)}
                    >
                      {MATCHER_LABELS[kind]}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="btn btn-xs sm:btn-sm btn-soft"
                onClick={handleReset}
              >
                Reset scene
              </button>
            </div>
          </div>
          <CurveChart
            curve={curve}
            sortedApCurve={sortedApCurve}
            hoverThreshold={hoverThreshold}
            pinnedThreshold={pinnedThreshold}
            pqAtActive={activeStats?.pq ?? null}
            renderMode={thresholdMode === 'scene' ? 'step' : 'linear'}
            showHint={!hasEverPinned}
            thresholdMode={thresholdMode}
            onThresholdModeChange={setThresholdMode}
            showSortedAp={showSortedAp}
            onShowSortedApChange={setShowSortedAp}
            showAutc={showAutc}
            onShowAutcChange={setShowAutc}
            showAutcSq={showAutcSq}
            onShowAutcSqChange={setShowAutcSq}
            showAutcRq={showAutcRq}
            onShowAutcRqChange={setShowAutcRq}
            onHover={setHoverThreshold}
            onPin={(t) => {
              setPinnedThreshold(t)
              setHasEverPinned(true)
            }}
            onClearPin={() => setPinnedThreshold(null)}
          />
          <CalcReadout
            threshold={activeThreshold}
            stats={activeStats}
            source={activeSource}
            globalIoU={gIoU}
            autc={autc}
            autcSq={autcSq}
            autcRq={autcRq}
            sortedAp={sortedAp}
            showAutc={showAutc}
            showAutcSq={showAutcSq}
            showAutcRq={showAutcRq}
            showSortedAp={showSortedAp}
          />
        </div>
      </div>
    </div >
  )
}

export default App
