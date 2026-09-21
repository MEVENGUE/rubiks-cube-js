import type { Face } from '../cube/notation'

export type GraphNode = {
  x: number
  y: number
  face: Face
  index: number
}

export type GraphCircle = { cx: number; cy: number; r: number; face: Face }
export type Pt = { x: number; y: number }

export type GraphLayout = {
  nodes: GraphNode[]
  circles: GraphCircle[]
  centers: Record<Face, Pt>
}

const FACE_ORDER: Face[] = ['U', 'L', 'F', 'R', 'B', 'D']

function distSq(a: Pt, b: Pt) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}

function intersections(p1: Pt, r1: number, p2: Pt, r2: number): Pt[] {
  const d2 = distSq(p1, p2)
  if (d2 === 0) return []
  const d = Math.sqrt(d2)
  if (d > r1 + r2 || d < Math.abs(r1 - r2)) return []
  const a = (r1 * r1 - r2 * r2 + d2) / (2 * d)
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a))
  const x2 = p1.x + (a * (p2.x - p1.x)) / d
  const y2 = p1.y + (a * (p2.y - p1.y)) / d
  return [
    { x: x2 + (h * (p2.y - p1.y)) / d, y: y2 - (h * (p2.x - p1.x)) / d },
    { x: x2 - (h * (p2.y - p1.y)) / d, y: y2 + (h * (p2.x - p1.x)) / d },
  ]
}

type NodeInfo = { pos: Pt; u: number; r: number; f: number }

export function buildGraphLayout(width: number, height: number): GraphLayout {
  const size = Math.min(width, height)
  const scale = size / 540
  const origin: Pt = { x: width / 2, y: height / 2 + size * 0.02 }
  const centerDist = 90 * scale
  const radii = [120, 145, 170].map((v) => v * scale)

  const centers: Record<Face, Pt> = {
    U: { x: origin.x, y: origin.y - centerDist },
    F: {
      x: origin.x + centerDist * Math.cos((150 * Math.PI) / 180),
      y: origin.y + centerDist * Math.sin((150 * Math.PI) / 180),
    },
    R: {
      x: origin.x + centerDist * Math.cos((30 * Math.PI) / 180),
      y: origin.y + centerDist * Math.sin((30 * Math.PI) / 180),
    },
    D: { x: 0, y: 0 },
    L: { x: 0, y: 0 },
    B: { x: 0, y: 0 },
  }
  centers.D = {
    x: centers.F.x + centers.R.x - centers.U.x,
    y: centers.F.y + centers.R.y - centers.U.y,
  }
  centers.L = {
    x: centers.U.x + centers.F.x - centers.R.x,
    y: centers.U.y + centers.F.y - centers.R.y,
  }
  centers.B = {
    x: centers.U.x + centers.R.x - centers.F.x,
    y: centers.U.y + centers.R.y - centers.F.y,
  }

  const circles: GraphCircle[] = []
  ;(['U', 'F', 'R'] as const).forEach((face) => {
    radii.forEach((r) => circles.push({ cx: centers[face].x, cy: centers[face].y, r, face }))
  })

  const groups: Record<Face, NodeInfo[]> = { U: [], D: [], L: [], R: [], F: [], B: [] }

  for (let u = 0; u < 3; u++) {
    for (let r = 0; r < 3; r++) {
      const ints = intersections(centers.U, radii[u], centers.R, radii[r])
      if (ints.length !== 2) continue
      const data = { u, r, f: -1 }
      if (distSq(ints[0], centers.F) < distSq(ints[1], centers.F)) {
        groups.F.push({ pos: ints[0], ...data })
        groups.B.push({ pos: ints[1], ...data })
      } else {
        groups.F.push({ pos: ints[1], ...data })
        groups.B.push({ pos: ints[0], ...data })
      }
    }
  }

  for (let u = 0; u < 3; u++) {
    for (let f = 0; f < 3; f++) {
      const ints = intersections(centers.U, radii[u], centers.F, radii[f])
      if (ints.length !== 2) continue
      const data = { u, r: -1, f }
      if (distSq(ints[0], centers.R) < distSq(ints[1], centers.R)) {
        groups.R.push({ pos: ints[0], ...data })
        groups.L.push({ pos: ints[1], ...data })
      } else {
        groups.R.push({ pos: ints[1], ...data })
        groups.L.push({ pos: ints[0], ...data })
      }
    }
  }

  for (let f = 0; f < 3; f++) {
    for (let r = 0; r < 3; r++) {
      const ints = intersections(centers.F, radii[f], centers.R, radii[r])
      if (ints.length !== 2) continue
      const data = { u: -1, r, f }
      if (distSq(ints[0], centers.U) < distSq(ints[1], centers.U)) {
        groups.U.push({ pos: ints[0], ...data })
        groups.D.push({ pos: ints[1], ...data })
      } else {
        groups.U.push({ pos: ints[1], ...data })
        groups.D.push({ pos: ints[0], ...data })
      }
    }
  }

  const nodes: GraphNode[] = []
  for (const face of FACE_ORDER) {
    const list = groups[face]
    let sorted: NodeInfo[]
    switch (face) {
      case 'U':
        sorted = [...list].sort((a, b) => (b.f - a.f) * 10 + (b.r - a.r))
        break
      case 'D':
        sorted = [...list].sort((a, b) => (a.f - b.f) * 10 + (b.r - a.r))
        break
      case 'F':
        sorted = [...list].sort((a, b) => (a.u - b.u) * 10 + (b.r - a.r))
        break
      case 'B':
        sorted = [...list].sort((a, b) => (a.u - b.u) * 10 + (a.r - b.r))
        break
      case 'R':
        sorted = [...list].sort((a, b) => (a.u - b.u) * 10 + (a.f - b.f))
        break
      default:
        sorted = [...list].sort((a, b) => (a.u - b.u) * 10 + (b.f - a.f))
    }
    sorted.slice(0, 9).forEach((n, i) => {
      nodes.push({ x: n.pos.x, y: n.pos.y, face, index: i })
    })
  }

  return { nodes, circles, centers }
}
