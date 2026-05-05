import type { Circle } from './geometry'
import type { MatcherKind } from './matchers'
import type { ThresholdMode } from './metrics'
import { SCENE_HEIGHT, SCENE_WIDTH } from './scene'

export type SceneState = {
  refs: Circle[]
  preds: Circle[]
  matcher: MatcherKind
  thresholdMode: ThresholdMode
  showSortedAp: boolean
  showAutc: boolean
  showAutcSq: boolean
  showAutcRq: boolean
}

const MATCHERS: readonly MatcherKind[] = ['greedy', 'hungarian', 'maximize-merge']
const MODES: readonly ThresholdMode[] = ['discrete', 'scene']

const round3 = (n: number) => Math.round(n * 1000) / 1000

const encodeCircles = (circles: Circle[]): string =>
  circles
    .map(
      (c) =>
        `${round3(c.x / SCENE_WIDTH)},${round3(c.y / SCENE_HEIGHT)},${round3(
          c.r / SCENE_WIDTH,
        )}`,
    )
    .join(';')

const decodeCircles = (s: string): Circle[] | null => {
  const trimmed = s.trim()
  if (!trimmed) return []
  const parts = trimmed.split(';')
  const out: Circle[] = []
  for (const part of parts) {
    const tokens = part.split(',')
    if (tokens.length !== 3) return null
    const nx = Number(tokens[0])
    const ny = Number(tokens[1])
    const nr = Number(tokens[2])
    if (![nx, ny, nr].every(Number.isFinite)) return null
    out.push({
      x: nx * SCENE_WIDTH,
      y: ny * SCENE_HEIGHT,
      r: nr * SCENE_WIDTH,
    })
  }
  return out
}

export const serializeSceneState = (state: SceneState): URLSearchParams => {
  const params = new URLSearchParams()
  params.set('refs', encodeCircles(state.refs))
  params.set('preds', encodeCircles(state.preds))
  params.set('matcher', state.matcher)
  params.set('mode', state.thresholdMode)
  params.set('sap', state.showSortedAp ? '1' : '0')
  params.set('autc', state.showAutc ? '1' : '0')
  params.set('asq', state.showAutcSq ? '1' : '0')
  params.set('arq', state.showAutcRq ? '1' : '0')
  return params
}

export const parseSceneState = (
  search: string | URLSearchParams,
  defaults: SceneState,
): SceneState => {
  const params =
    typeof search === 'string' ? new URLSearchParams(search) : search

  const refsRaw = params.get('refs')
  const refs =
    refsRaw === null ? defaults.refs : decodeCircles(refsRaw) ?? defaults.refs

  const predsRaw = params.get('preds')
  const preds =
    predsRaw === null
      ? defaults.preds
      : decodeCircles(predsRaw) ?? defaults.preds

  const matcherRaw = params.get('matcher') as MatcherKind | null
  const matcher =
    matcherRaw && MATCHERS.includes(matcherRaw) ? matcherRaw : defaults.matcher

  const modeRaw = params.get('mode') as ThresholdMode | null
  const thresholdMode =
    modeRaw && MODES.includes(modeRaw) ? modeRaw : defaults.thresholdMode

  const sapRaw = params.get('sap')
  const showSortedAp =
    sapRaw === '1' ? true : sapRaw === '0' ? false : defaults.showSortedAp

  const autcRaw = params.get('autc')
  const showAutc =
    autcRaw === '1' ? true : autcRaw === '0' ? false : defaults.showAutc

  const asqRaw = params.get('asq')
  const showAutcSq =
    asqRaw === '1' ? true : asqRaw === '0' ? false : defaults.showAutcSq

  const arqRaw = params.get('arq')
  const showAutcRq =
    arqRaw === '1' ? true : arqRaw === '0' ? false : defaults.showAutcRq

  return {
    refs,
    preds,
    matcher,
    thresholdMode,
    showSortedAp,
    showAutc,
    showAutcSq,
    showAutcRq,
  }
}
