export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const
export type Face = (typeof FACES)[number]

export const FACE_HEX: Record<Face, string> = {
  U: '#f4f1ea',
  R: '#c62828',
  F: '#2e9d48',
  D: '#f2c400',
  L: '#ef6c00',
  B: '#1e66c7',
}

export const SOLVED =
  'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'

export type Axis = 0 | 1 | 2

export const FACE_TWIST: Record<Face, { axis: Axis; layer: -1 | 0 | 1; dir: number }> = {
  U: { axis: 1, layer: 1, dir: -1 },
  D: { axis: 1, layer: -1, dir: 1 },
  R: { axis: 0, layer: 1, dir: -1 },
  L: { axis: 0, layer: -1, dir: 1 },
  F: { axis: 2, layer: 1, dir: -1 },
  B: { axis: 2, layer: -1, dir: 1 },
}

export type ParsedMove = { face: Face; turns: number; notation: string }

export function parseMove(token: string): ParsedMove | null {
  const m = token.trim().match(/^([URFDLB])([2']?)$/)
  if (!m) return null
  const face = m[1] as Face
  const turns = m[2] === "'" ? -1 : m[2] === '2' ? 2 : 1
  return { face, turns, notation: token.trim() }
}

export function parseAlg(alg: string): ParsedMove[] {
  return alg
    .trim()
    .split(/\s+/)
    .map(parseMove)
    .filter((x): x is ParsedMove => x !== null)
}

export function invertMove(move: ParsedMove): ParsedMove {
  if (move.turns === 2) return move
  const turns = -move.turns as 1 | -1
  const notation = `${move.face}${turns === -1 ? "'" : ''}`
  return { face: move.face, turns, notation }
}
