import { useRef } from 'react'
import type { CurvePoint, SortedAPPoint, ThresholdMode } from '../lib/metrics'

export type { ThresholdMode }

type Props = {
  curve: CurvePoint[]
  sortedApCurve: SortedAPPoint[]
  hoverThreshold: number | null
  pinnedThreshold: number | null
  pqAtActive: number | null
  renderMode: 'linear' | 'step'
  showHint: boolean
  thresholdMode: ThresholdMode
  onThresholdModeChange: (mode: ThresholdMode) => void
  showSortedAp: boolean
  onShowSortedApChange: (show: boolean) => void
  showAutc: boolean
  onShowAutcChange: (show: boolean) => void
  showAutcSq: boolean
  onShowAutcSqChange: (show: boolean) => void
  showAutcRq: boolean
  onShowAutcRqChange: (show: boolean) => void
  onHover: (t: number | null) => void
  onPin: (t: number) => void
  onClearPin: () => void
}

const W = 600
const H = 360
const PAD_L = 60
const PAD_R = 30
const PAD_T = 30
const PAD_B = 40
const ACCENT = '#0ea5e9'
const SORTED_AP = '#f59e0b'
const SQ_COLOR = '#10b981'
const RQ_COLOR = '#a855f7'
const PIN = '#6366f1'
const HOVER = '#94a3b8'

export const CurveChart = ({
  curve,
  sortedApCurve,
  hoverThreshold,
  pinnedThreshold,
  pqAtActive,
  renderMode,
  showHint,
  thresholdMode,
  onThresholdModeChange,
  showSortedAp,
  onShowSortedApChange,
  showAutc,
  onShowAutcChange,
  showAutcSq,
  onShowAutcSqChange,
  showAutcRq,
  onShowAutcRqChange,
  onHover,
  onPin,
  onClearPin,
}: Props) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B

  const x = (t: number) => PAD_L + t * plotW
  const y = (v: number) => PAD_T + (1 - v) * plotH

  const snapToCurve = (t: number): number => {
    if (curve.length === 0) return t
    let best = curve[0].threshold
    let bestDist = Math.abs(t - best)
    for (let i = 1; i < curve.length; i++) {
      const d = Math.abs(t - curve[i].threshold)
      if (d < bestDist) {
        bestDist = d
        best = curve[i].threshold
      }
    }
    return best
  }

  const thresholdFromClientX = (clientX: number): number | null => {
    const svg = svgRef.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = 0
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const local = pt.matrixTransform(ctm.inverse())
    const tRaw = (local.x - PAD_L) / plotW
    return snapToCurve(Math.max(0, Math.min(1, tRaw)))
  }

  const buildLinePath = (pick: (p: CurvePoint) => number): string => {
    if (curve.length === 0) return ''
    if (renderMode === 'step') {
      if (curve.length < 2) return ''
      const xsLocal = curve.map((c) => c.threshold)
      const ysLocal = curve.map(pick)
      let path = `M ${x(xsLocal[0])} ${y(ysLocal[1])} H ${x(xsLocal[1])}`
      for (let i = 1; i < xsLocal.length - 1; i++) {
        path += ` V ${y(ysLocal[i + 1])} H ${x(xsLocal[i + 1])}`
      }
      return path
    }
    const xsLocal = [0, ...curve.map((c) => c.threshold)]
    const ysLocal = [pick(curve[0]), ...curve.map(pick)]
    return xsLocal
      .map((t, i) => `${i === 0 ? 'M' : 'L'} ${x(t)} ${y(ysLocal[i])}`)
      .join(' ')
  }

  const xs =
    renderMode === 'step'
      ? curve.map((c) => c.threshold)
      : [0, ...curve.map((c) => c.threshold)]
  const ys =
    renderMode === 'step'
      ? curve.map((c) => c.pq)
      : curve.length
      ? [curve[0].pq, ...curve.map((c) => c.pq)]
      : []

  const linePath = showAutc ? buildLinePath((p) => p.pq) : ''
  const sqPath = showAutcSq ? buildLinePath((p) => p.sq) : ''
  const rqPath = showAutcRq ? buildLinePath((p) => p.rq) : ''
  let areaPath = ''
  if (xs.length > 0) {
    if (renderMode === 'step' && xs.length >= 2) {
      areaPath = `M ${x(xs[0])} ${y(0)} L ${x(xs[0])} ${y(ys[1])} H ${x(xs[1])}`
      for (let i = 1; i < xs.length - 1; i++) {
        areaPath += ` V ${y(ys[i + 1])} H ${x(xs[i + 1])}`
      }
      areaPath += ` L ${x(xs[xs.length - 1])} ${y(0)} Z`
    } else if (renderMode !== 'step') {
      areaPath =
        `M ${x(xs[0])} ${y(0)} ` +
        xs.map((t, i) => `L ${x(t)} ${y(ys[i])}`).join(' ') +
        ` L ${x(xs[xs.length - 1])} ${y(0)} Z`
    }
  }

  let sortedApPath = ''
  if (sortedApCurve.length > 0) {
    const p0 = sortedApCurve[0]
    sortedApPath = `M ${x(p0.threshold)} ${y(p0.ap)}`
    for (let i = 1; i < sortedApCurve.length; i++) {
      const p = sortedApCurve[i]
      sortedApPath += ` H ${x(p.threshold)} V ${y(p.ap)}`
    }
    sortedApPath += ` H ${x(1)}`
  }

  const gridXs = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
  const gridYs = [0, 0.25, 0.5, 0.75, 1]

  const legendEntries: { label: string; color: string; dash?: string }[] = []
  if (showAutc) legendEntries.push({ label: 'PQ', color: ACCENT })
  if (showAutcSq) legendEntries.push({ label: 'SQ', color: SQ_COLOR, dash: '2 3' })
  if (showAutcRq) legendEntries.push({ label: 'RQ', color: RQ_COLOR, dash: '2 3' })
  if (showSortedAp)
    legendEntries.push({ label: 'SortedAP', color: SORTED_AP, dash: '4 3' })
  const legendRowH = 18
  const legendBoxW = 50
  const legendBoxH = legendEntries.length * legendRowH + 6
  const legendX = W - PAD_R - legendBoxW - 16
  const legendY = PAD_T + 4

  const activeThreshold = hoverThreshold ?? pinnedThreshold

  const selectMode = (mode: ThresholdMode) => {
    onThresholdModeChange(mode)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-2 flex-wrap h-[36px]">
        <h2>
          {(() => {
            const parts: string[] = []
            if (showAutc) parts.push('PQ')
            if (showAutcSq) parts.push('SQ')
            if (showAutcRq) parts.push('RQ')
            if (showSortedAp) parts.push('SortedAP')
            if (parts.length === 0) return 'IoU threshold'
            return `${parts.join(parts.length > 2 ? ', ' : ' & ')} vs IoU threshold`
          })()}
        </h2>
      </div>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          fontFamily="serif"
          className="w-full h-auto bg-base-100 rounded-lg border border-base-300 cursor-crosshair"
          onPointerMove={(e) => {
            const t = thresholdFromClientX(e.clientX)
            if (t !== null) onHover(t)
          }}
          onPointerLeave={() => onHover(null)}
          onClick={(e) => {
            const t = thresholdFromClientX(e.clientX)
            if (t === null) return
            if (
              pinnedThreshold !== null &&
              Math.abs(t - pinnedThreshold) < 1e-9
            ) {
              onClearPin()
            } else {
              onPin(t)
            }
          }}
        >
          {gridYs.map((v) => (
            <line
              key={`gy-${v}`}
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              opacity="0.1"
            />
          ))}
          {gridXs.map((t) => (
            <line
              key={`gx-${t}`}
              x1={x(t)}
              x2={x(t)}
              y1={PAD_T}
              y2={H - PAD_B}
              stroke="currentColor"
              opacity="0.1"
            />
          ))}

          {showAutc && (
            <>
              <path d={areaPath} fill={ACCENT} fillOpacity={0.2} />
              <path d={linePath} fill="none" stroke={ACCENT} strokeWidth={2} />
            </>
          )}
          {showAutcSq && (
            <path
              d={sqPath}
              fill="none"
              stroke={SQ_COLOR}
              strokeWidth={2}
              strokeDasharray="2 3"
            />
          )}
          {showAutcRq && (
            <path
              d={rqPath}
              fill="none"
              stroke={RQ_COLOR}
              strokeWidth={2}
              strokeDasharray="2 3"
            />
          )}
          {showSortedAp && (
            <path
              d={sortedApPath}
              fill="none"
              stroke={SORTED_AP}
              strokeWidth={2}
              strokeDasharray="4 3"
            />
          )}

          {pinnedThreshold !== null && (
            <line
              x1={x(pinnedThreshold)}
              x2={x(pinnedThreshold)}
              y1={PAD_T}
              y2={H - PAD_B}
              stroke={PIN}
              strokeWidth={1.5}
            />
          )}
          {hoverThreshold !== null && (
            <line
              x1={x(hoverThreshold)}
              x2={x(hoverThreshold)}
              y1={PAD_T}
              y2={H - PAD_B}
              stroke={HOVER}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          )}
          {showAutc && activeThreshold !== null && pqAtActive !== null && (
            <>
              <circle
                cx={x(activeThreshold)}
                cy={y(pqAtActive)}
                r={4}
                fill={hoverThreshold !== null ? HOVER : PIN}
                stroke="white"
                strokeWidth={1.5}
              />
            </>
          )}

          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={H - PAD_B}
            y2={H - PAD_B}
            stroke="currentColor"
            opacity="0.5"
          />
          <line
            x1={PAD_L}
            x2={PAD_L}
            y1={PAD_T}
            y2={H - PAD_B}
            stroke="currentColor"
            opacity="0.5"
          />

          <g fontSize="16" fill="currentColor" opacity="0.7" style={{ pointerEvents: 'none' }}>
            {gridXs.map((t) =>
              t === 0 ? null : (
                <text
                  key={`tx-${t}`}
                  x={x(t)}
                  y={H - PAD_B + 16}
                  textAnchor="middle"
                >
                  {t.toFixed(1)}
                </text>
              ),
            )}
            {gridYs.map((v) => (
              <text key={`ty-${v}`} x={PAD_L - 6} y={y(v) + 3} textAnchor="end">
                {v === 0 ? '0' : v.toFixed(2)}
              </text>
            ))}
            <text
              x={PAD_L + plotW / 2}
              y={H - 6}
              textAnchor="middle"
              fontSize="16"
            >
              IoU threshold
            </text>
            <text
              x={16}
              y={PAD_T + plotH / 2}
              textAnchor="middle"
              fontSize="16"
              transform={`rotate(-90 16 ${PAD_T + plotH / 2})`}
            >
              PQ
            </text>
          </g>

          {legendEntries.length > 0 && (
            <g transform={`translate(${legendX}, ${legendY})`} fontSize="11">
              <rect
                x={0}
                y={0}
                width={legendBoxW}
                height={legendBoxH}
                fill="white"
                fillOpacity={0.1}
              />
              {legendEntries.map((e, i) => (
                <g key={e.label} transform={`translate(6, ${6 + i * legendRowH})`}>
                  <line
                    x1={0}
                    x2={20}
                    y1={6}
                    y2={6}
                    stroke={e.color}
                    strokeWidth={2}
                    strokeDasharray={e.dash}
                  />
                  <text fontSize={16} x={26} y={9} fill="currentColor">
                    {e.label}
                  </text>
                </g>
              ))}
            </g>
          )}
        </svg>

        {showHint && (
          <div className="pointer-events-none absolute top-1/4 left-2/3 flex items-center gap-1.5 text-xs opacity-70">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
            </svg>
            <span>Hover or click to pin</span>
          </div>
        )}

        <div className="absolute top-1 right-1 z-10">
          <div className="dropdown dropdown-end">
            <div
              tabIndex={0}
              role="button"
              aria-label="Chart settings"
              className="btn btn-xs btn-ghost btn-circle"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                aria-hidden="true"
                fill="currentColor"
              >
                <path d="M19.14 12.94a7.49 7.49 0 0 0 .05-.94 7.49 7.49 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.65 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.62-.05.94s.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.69.24l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.26.1.55 0 .69-.24l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" />
              </svg>
            </div>
            <ul
              tabIndex={0}
              className="dropdown-content menu bg-base-200 rounded-box shadow border border-base-300 w-56 p-2 mt-1 z-20"
            >
              <li className="menu-title">IoU thresholds</li>
              <li>
                <button
                  className={thresholdMode === 'discrete' ? 'menu-active' : ''}
                  onClick={() => selectMode('discrete')}
                >
                  Discrete (0.05 step)
                </button>
              </li>
              <li>
                <button
                  className={thresholdMode === 'scene' ? 'menu-active' : ''}
                  onClick={() => selectMode('scene')}
                >
                  Scene steps
                </button>
              </li>
              <li className="menu-title">Curves</li>
              <li>
                <label className="cursor-pointer flex items-center justify-between gap-2">
                  <span>Show AUTC (PQ)</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-sm"
                    checked={showAutc}
                    onChange={(e) => onShowAutcChange(e.target.checked)}
                  />
                </label>
              </li>
              <li>
                <label className="cursor-pointer flex items-center justify-between gap-2">
                  <span>
                    Show AUTC<sub>SQ</sub>
                  </span>
                  <input
                    type="checkbox"
                    className="toggle toggle-sm"
                    checked={showAutcSq}
                    onChange={(e) => onShowAutcSqChange(e.target.checked)}
                  />
                </label>
              </li>
              <li>
                <label className="cursor-pointer flex items-center justify-between gap-2">
                  <span>
                    Show AUTC<sub>RQ</sub>
                  </span>
                  <input
                    type="checkbox"
                    className="toggle toggle-sm"
                    checked={showAutcRq}
                    onChange={(e) => onShowAutcRqChange(e.target.checked)}
                  />
                </label>
              </li>
              <li>
                <label className="cursor-pointer flex items-center justify-between gap-2">
                  <span>Show SortedAP</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-sm"
                    checked={showSortedAp}
                    onChange={(e) => onShowSortedApChange(e.target.checked)}
                  />
                </label>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
