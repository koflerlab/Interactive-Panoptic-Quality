import type { Circle } from './geometry'

export const SCENE_WIDTH = 600
export const SCENE_HEIGHT = 360

export const EDGE_BAND = 8
export const R_MIN = 10
export const R_MAX = 180
export const NEW_CIRCLE_R = 50

export const DEFAULT_REFS: Circle[] = [
  { x: 150, y: 140, r: 55 },
  { x: 320, y: 210, r: 70 },
  { x: 470, y: 130, r: 45 },
]

export const DEFAULT_PREDS: Circle[] = [
  { x: 145, y: 150, r: 55 },
  { x: 300, y: 210, r: 65 },
  { x: 485, y: 145, r: 50 },
]
