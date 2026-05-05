import { describe, it, expect } from 'vitest'
import {
  parseSceneState,
  serializeSceneState,
  type SceneState,
} from './urlState'
import { SCENE_HEIGHT, SCENE_WIDTH } from './scene'

const defaults: SceneState = {
  refs: [{ x: 100, y: 50, r: 30 }],
  preds: [{ x: 200, y: 80, r: 40 }],
  matcher: 'greedy',
  thresholdMode: 'scene',
  showSortedAp: false,
  showAutc: true,
  showAutcSq: false,
  showAutcRq: false,
}

describe('serializeSceneState', () => {
  it('encodes circles with 3-decimal normalized coords', () => {
    const state: SceneState = {
      ...defaults,
      refs: [{ x: 150, y: 140, r: 60 }],
      preds: [{ x: 300, y: 181, r: 30 }],
    }
    const params = serializeSceneState(state)
    // 150/600 = 0.25, 140/362 ≈ 0.387, 60/600 = 0.1
    expect(params.get('refs')).toBe('0.25,0.387,0.1')
    // 300/600 = 0.5, 181/362 = 0.5, 30/600 = 0.05
    expect(params.get('preds')).toBe('0.5,0.5,0.05')
    expect(params.get('matcher')).toBe('greedy')
    expect(params.get('mode')).toBe('scene')
  })

  it('joins multiple circles with semicolons', () => {
    const state: SceneState = {
      ...defaults,
      refs: [
        { x: 0, y: 0, r: 0 },
        { x: SCENE_WIDTH, y: SCENE_HEIGHT, r: SCENE_WIDTH },
      ],
    }
    const params = serializeSceneState(state)
    expect(params.get('refs')).toBe('0,0,0;1,1,1')
  })
})

describe('parseSceneState', () => {
  it('round-trips state within 3-decimal precision', () => {
    const state: SceneState = {
      refs: [
        { x: 150, y: 140, r: 55 },
        { x: 320, y: 210, r: 70 },
      ],
      preds: [{ x: 145, y: 150, r: 55 }],
      matcher: 'hungarian',
      thresholdMode: 'discrete',
      showSortedAp: false,
      showAutc: false,
      showAutcSq: false,
      showAutcRq: false,
    }
    const params = serializeSceneState(state)
    const parsed = parseSceneState(params, defaults)

    expect(parsed.matcher).toBe('hungarian')
    expect(parsed.thresholdMode).toBe('discrete')
    expect(parsed.showSortedAp).toBe(false)
    expect(parsed.showAutc).toBe(false)
    expect(parsed.showAutcSq).toBe(false)
    expect(parsed.showAutcRq).toBe(false)
    expect(parsed.refs).toHaveLength(2)
    expect(parsed.preds).toHaveLength(1)

    // 3-decimal normalized → tolerance ≈ scene-dim / 2000
    const tolX = SCENE_WIDTH / 2000
    const tolY = SCENE_HEIGHT / 2000
    for (let i = 0; i < state.refs.length; i++) {
      expect(parsed.refs[i].x).toBeCloseTo(state.refs[i].x, 0)
      expect(parsed.refs[i].y).toBeCloseTo(state.refs[i].y, 0)
      expect(parsed.refs[i].r).toBeCloseTo(state.refs[i].r, 0)
      expect(Math.abs(parsed.refs[i].x - state.refs[i].x)).toBeLessThan(tolX)
      expect(Math.abs(parsed.refs[i].y - state.refs[i].y)).toBeLessThan(tolY)
    }
  })

  it('falls back to defaults when fields are missing', () => {
    const parsed = parseSceneState('', defaults)
    expect(parsed).toEqual(defaults)
  })

  it('falls back to defaults on malformed circles', () => {
    const parsed = parseSceneState('refs=not-a-circle&preds=0.1,0.2', defaults)
    expect(parsed.refs).toEqual(defaults.refs)
    expect(parsed.preds).toEqual(defaults.preds)
  })

  it('falls back to defaults on non-finite values', () => {
    const parsed = parseSceneState('refs=NaN,0.2,0.1', defaults)
    expect(parsed.refs).toEqual(defaults.refs)
  })

  it('rejects unknown matcher and falls back to default', () => {
    const parsed = parseSceneState('matcher=mystery', defaults)
    expect(parsed.matcher).toBe(defaults.matcher)
  })

  it('rejects unknown threshold mode and falls back to default', () => {
    const parsed = parseSceneState('mode=continuous', defaults)
    expect(parsed.thresholdMode).toBe(defaults.thresholdMode)
  })

  it('accepts all valid matcher values', () => {
    for (const m of ['greedy', 'hungarian', 'maximize-merge'] as const) {
      const parsed = parseSceneState(`matcher=${m}`, defaults)
      expect(parsed.matcher).toBe(m)
    }
  })

  it('accepts all valid mode values', () => {
    for (const mode of ['discrete', 'scene'] as const) {
      const parsed = parseSceneState(`mode=${mode}`, defaults)
      expect(parsed.thresholdMode).toBe(mode)
    }
  })

  it('parses sap=0 as false and sap=1 as true', () => {
    expect(parseSceneState('sap=0', defaults).showSortedAp).toBe(false)
    expect(parseSceneState('sap=1', defaults).showSortedAp).toBe(true)
  })

  it('falls back to default for unknown sap value', () => {
    expect(parseSceneState('sap=maybe', defaults).showSortedAp).toBe(
      defaults.showSortedAp,
    )
  })

  it('parses autc=0/1, asq=0/1, and arq=0/1 as booleans', () => {
    expect(parseSceneState('autc=0', defaults).showAutc).toBe(false)
    expect(parseSceneState('autc=1', defaults).showAutc).toBe(true)
    expect(parseSceneState('asq=0', defaults).showAutcSq).toBe(false)
    expect(parseSceneState('asq=1', defaults).showAutcSq).toBe(true)
    expect(parseSceneState('arq=0', defaults).showAutcRq).toBe(false)
    expect(parseSceneState('arq=1', defaults).showAutcRq).toBe(true)
  })

  it('falls back to defaults for unknown autc/asq/arq values', () => {
    expect(parseSceneState('autc=maybe', defaults).showAutc).toBe(
      defaults.showAutc,
    )
    expect(parseSceneState('asq=maybe', defaults).showAutcSq).toBe(
      defaults.showAutcSq,
    )
    expect(parseSceneState('arq=maybe', defaults).showAutcRq).toBe(
      defaults.showAutcRq,
    )
  })

  it('parses an empty refs param as an empty array', () => {
    const parsed = parseSceneState('refs=&preds=0.1,0.2,0.05', defaults)
    expect(parsed.refs).toEqual([])
    expect(parsed.preds).toHaveLength(1)
  })

  it('accepts a URLSearchParams instance', () => {
    const params = new URLSearchParams()
    params.set('matcher', 'hungarian')
    const parsed = parseSceneState(params, defaults)
    expect(parsed.matcher).toBe('hungarian')
  })
})
