import type { PQStats } from '../lib/metrics'

type Props = {
  threshold: number | null
  stats: PQStats | null
  source: 'hover' | 'pinned' | null
  globalIoU: number
  autc: number
  autcSq: number
  autcRq: number
  sortedAp: number
  showAutc: boolean
  showAutcSq: boolean
  showAutcRq: boolean
  showSortedAp: boolean
}

export const CalcReadout = ({
  threshold,
  stats,
  source,
  globalIoU,
  autc,
  autcSq,
  autcRq,
  sortedAp,
  showAutc,
  showAutcSq,
  showAutcRq,
  showSortedAp,
}: Props) => {
  const metricsRow = (
    <div className="flex items-baseline gap-x-4 gap-y-1 font-mono text-sm flex-wrap">
      <span>
        global IoU ={' '}
        <span className="text-lg font-bold">{globalIoU.toFixed(3)}</span>
      </span>
      {showAutc && (
        <span>
          AUTC = <span className="text-lg font-bold">{autc.toFixed(3)}</span>
        </span>
      )}
      {showAutcSq && (
        <span>
          AUTC<sub>SQ</sub> ={' '}
          <span className="text-lg font-bold">{autcSq.toFixed(3)}</span>
        </span>
      )}
      {showAutcRq && (
        <span>
          AUTC<sub>RQ</sub> ={' '}
          <span className="text-lg font-bold">{autcRq.toFixed(3)}</span>
        </span>
      )}
      {showSortedAp && (
        <span>
          sortedAP ={' '}
          <span className="text-lg font-bold">{sortedAp.toFixed(3)}</span>
        </span>
      )}
    </div>
  )

  if (threshold === null || stats === null) {
    return (
      <div className="min-h-[260px] bg-base-100 border border-base-300 rounded-lg p-4 flex flex-col gap-4 lg:col-span-2">
        {metricsRow}
        <div className="flex-1 border border-base-300 border-dashed rounded-lg flex items-center justify-center text-sm opacity-60 italic">
          Hover the chart to inspect a threshold. Click to pin.
        </div>
      </div>
    )
  }

  const { tp, fp, fn, sq, rq, pq, mergedMatches } = stats
  const iouList = mergedMatches.map((m) => m.iou.toFixed(3)).join(' + ')
  const rqNum = tp
  const rqDen = tp + 0.5 * fp + 0.5 * fn

  return (
    <div className="min-h-[260px] bg-base-100 border border-base-300 rounded-lg p-4 flex flex-col gap-4 lg:col-span-2">
      {metricsRow}
      <div className="font-mono text-sm leading-relaxed">
        <div className="mb-2 text-base font-semibold not-italic">
          @ threshold t = {threshold.toFixed(3)}{' '}
          <span className="badge badge-sm ml-1">
            {source === 'hover' ? 'hover preview' : 'pinned'}
          </span>
        </div>

        <div>
          TP = <b>{tp}</b>, FP = <b>{fp}</b>, FN = <b>{fn}</b>
        </div>

        <div className="mt-2">
          RQ = TP / (TP + 0.5·FP + 0.5·FN)
          <br />
          &nbsp;&nbsp;&nbsp; = {rqNum} / ({tp} + 0.5·{fp} + 0.5·{fn})
          <br />
          &nbsp;&nbsp;&nbsp; = {rqNum} / {rqDen.toFixed(2)} = <b>{rq.toFixed(3)}</b>
        </div>

        <div className="mt-2">
          SQ = mean IoU of matched pairs
          <br />
          &nbsp;&nbsp;&nbsp; ={' '}
          {tp === 0
            ? '0 (no matches)'
            : `(${iouList}) / ${tp} = `}
          {tp === 0 ? '' : <b>{sq.toFixed(3)}</b>}
        </div>

        <div className="mt-2">
          PQ = SQ · RQ = {sq.toFixed(3)} · {rq.toFixed(3)} ={' '}
          <b className="text-base">{pq.toFixed(3)}</b>
        </div>
      </div>
    </div>
  )
}
