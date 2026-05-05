export type Circle = {
  x: number
  y: number
  r: number
}

export function circleIoU(a: Circle, b: Circle): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const d = Math.hypot(dx, dy)
  const r1 = a.r
  const r2 = b.r

  if (d >= r1 + r2) return 0
  if (d <= Math.abs(r1 - r2)) {
    const small = Math.min(r1, r2)
    const large = Math.max(r1, r2)
    return (small * small) / (large * large)
  }

  const r1sq = r1 * r1
  const r2sq = r2 * r2
  const alpha = Math.acos((d * d + r1sq - r2sq) / (2 * d * r1))
  const beta = Math.acos((d * d + r2sq - r1sq) / (2 * d * r2))
  const intersection =
    r1sq * alpha +
    r2sq * beta -
    0.5 * Math.sqrt(
      (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2),
    )

  const union = Math.PI * r1sq + Math.PI * r2sq - intersection
  if (union <= 0) return 0
  return intersection / union
}

const TAU = 2 * Math.PI

function normalizeAngle(a: number): number {
  let x = a % TAU
  if (x < 0) x += TAU
  return x
}

export function unionArea(circles: Circle[]): number {
  const n = circles.length
  if (n === 0) return 0

  const skip = new Array<boolean>(n).fill(false)
  for (let i = 0; i < n; i++) {
    if (skip[i]) continue
    for (let j = 0; j < n; j++) {
      if (i === j || skip[j]) continue
      const dx = circles[i].x - circles[j].x
      const dy = circles[i].y - circles[j].y
      const d = Math.hypot(dx, dy)
      if (d + circles[i].r <= circles[j].r) {
        if (d + circles[i].r < circles[j].r || i > j) {
          skip[i] = true
          break
        }
      }
    }
  }

  let total = 0
  for (let i = 0; i < n; i++) {
    if (skip[i]) continue
    const C = circles[i]
    const angles: number[] = []

    for (let j = 0; j < n; j++) {
      if (j === i || skip[j]) continue
      const D = circles[j]
      const dx = D.x - C.x
      const dy = D.y - C.y
      const d = Math.hypot(dx, dy)
      if (d >= C.r + D.r) continue
      if (d <= Math.abs(C.r - D.r)) continue
      const phi = Math.atan2(dy, dx)
      const cosArg = (C.r * C.r + d * d - D.r * D.r) / (2 * C.r * d)
      const alpha = Math.acos(Math.max(-1, Math.min(1, cosArg)))
      angles.push(normalizeAngle(phi - alpha))
      angles.push(normalizeAngle(phi + alpha))
    }

    if (angles.length === 0) {
      total += Math.PI * C.r * C.r
      continue
    }

    angles.sort((a, b) => a - b)
    angles.push(angles[0] + TAU)

    for (let k = 0; k < angles.length - 1; k++) {
      const t1 = angles[k]
      const t2 = angles[k + 1]
      const tm = (t1 + t2) / 2
      const px = C.x + C.r * Math.cos(tm)
      const py = C.y + C.r * Math.sin(tm)
      let inside = false
      for (let j = 0; j < n; j++) {
        if (j === i || skip[j]) continue
        const D = circles[j]
        const ddx = px - D.x
        const ddy = py - D.y
        if (ddx * ddx + ddy * ddy < D.r * D.r) {
          inside = true
          break
        }
      }
      if (!inside) {
        total +=
          0.5 *
          (C.r * C.x * (Math.sin(t2) - Math.sin(t1)) -
            C.r * C.y * (Math.cos(t2) - Math.cos(t1)) +
            C.r * C.r * (t2 - t1))
      }
    }
  }
  return total
}

export function mergedIoU(preds: Circle[], ref: Circle): number {
  if (preds.length === 0) return 0
  const A = unionArea(preds)
  const G = Math.PI * ref.r * ref.r
  const AG = unionArea([...preds, ref])
  if (AG <= 0) return 0
  const inter = A + G - AG
  return inter / AG
}

export function globalIoU(refs: Circle[], preds: Circle[]): number {
  const refUnion = unionArea(refs)
  const predUnion = unionArea(preds)
  const combined = unionArea([...refs, ...preds])
  if (combined <= 0) return 0
  const intersection = refUnion + predUnion - combined
  if (intersection <= 0) return 0
  return intersection / combined
}
