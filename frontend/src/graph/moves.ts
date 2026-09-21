import Cube from 'cubejs/lib/cube.js'
import { MOVE_TWIST, type Face, type ParsedMove } from '../cube/notation'

const ORDER = 'URFDLB'

type Vec = [number, number, number]

function rotate(axis: 0 | 1 | 2, deg: number, v: Vec): Vec {
  const t = (deg * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  const [x, y, z] = v
  if (axis === 0) return [x, y * c - z * s, y * s + z * c]
  if (axis === 1) return [x * c + z * s, y, -x * s + z * c]
  return [x * c - y * s, x * s + y * c, z]
}

function roundVec(v: Vec): Vec {
  return [Math.round(v[0]), Math.round(v[1]), Math.round(v[2])]
}

const FACE_GEOM: Record<Face, { n: Vec; pos: (row: number, col: number) => Vec; slot: (p: Vec) => number }> = {
  U: {
    n: [0, 1, 0],
    pos: (row, col) => [col - 1, 1, row - 1],
    slot: (p) => (Math.round(p[2]) + 1) * 3 + (Math.round(p[0]) + 1),
  },
  R: {
    n: [1, 0, 0],
    pos: (row, col) => [1, 1 - row, 1 - col],
    slot: (p) => (1 - Math.round(p[1])) * 3 + (1 - Math.round(p[2])),
  },
  F: {
    n: [0, 0, 1],
    pos: (row, col) => [col - 1, 1 - row, 1],
    slot: (p) => (1 - Math.round(p[1])) * 3 + (Math.round(p[0]) + 1),
  },
  D: {
    n: [0, -1, 0],
    pos: (row, col) => [col - 1, -1, 1 - row],
    slot: (p) => (1 - Math.round(p[2])) * 3 + (Math.round(p[0]) + 1),
  },
  L: {
    n: [-1, 0, 0],
    pos: (row, col) => [-1, 1 - row, col - 1],
    slot: (p) => (1 - Math.round(p[1])) * 3 + (Math.round(p[2]) + 1),
  },
  B: {
    n: [0, 0, -1],
    pos: (row, col) => [1 - col, 1 - row, -1],
    slot: (p) => (1 - Math.round(p[1])) * 3 + (1 - Math.round(p[0])),
  },
}

function faceOf(normal: Vec): Face {
  const n = roundVec(normal)
  const found = (Object.keys(FACE_GEOM) as Face[]).find((face) =>
    FACE_GEOM[face].n.every((v, k) => v === n[k]),
  )
  if (!found) throw new Error('normale inconnue')
  return found
}

/** Index d’origine de chaque facette après le coup. */
export function sourcesForMove(move: ParsedMove): number[] {
  const spec = MOVE_TWIST[move.face]
  const deg = spec.dir * move.turns * 90
  const src = Array.from({ length: 54 }, (_, i) => i)
  for (const face of ORDER) {
    const geom = FACE_GEOM[face as Face]
    for (let i = 0; i < 9; i++) {
      const cubie = geom.pos(Math.floor(i / 3), i % 3)
      let pos: Vec = cubie
      let normal = geom.n
      if (spec.layer === null || Math.round(cubie[spec.axis]) === spec.layer) {
        pos = rotate(spec.axis, deg, cubie)
        normal = rotate(spec.axis, deg, geom.n)
      }
      const destFace = faceOf(normal)
      const dest = ORDER.indexOf(destFace) * 9 + FACE_GEOM[destFace].slot(roundVec(pos))
      src[dest] = ORDER.indexOf(face) * 9 + i
    }
  }
  return src
}

export function applyFacelets(facelets: string, notation: string): string {
  const c = Cube.fromString(facelets)
  c.move(notation)
  return c.asString()
}
