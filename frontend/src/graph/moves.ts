import Cube from 'cubejs/lib/cube.js'
import { type Face, type ParsedMove } from '../cube/notation'

const U = 0, R = 9, F = 18, D = 27, L = 36, B = 45

function cycle<T>(arr: T[], ...idx: number[]) {
  if (idx.length < 2) return
  const vals = idx.map((i) => arr[i])
  for (let i = 0; i < idx.length; i++) arr[idx[(i + 1) % idx.length]] = vals[i]
}

function spinCW<T>(arr: T[], o: number) {
  cycle(arr, o + 0, o + 2, o + 8, o + 6)
  cycle(arr, o + 1, o + 5, o + 7, o + 3)
}

function quarterCW<T>(arr: T[], face: Face) {
  switch (face) {
    case 'U':
      spinCW(arr, U)
      cycle(arr, R + 0, F + 0, L + 0, B + 0)
      cycle(arr, R + 1, F + 1, L + 1, B + 1)
      cycle(arr, R + 2, F + 2, L + 2, B + 2)
      break
    case 'D':
      spinCW(arr, D)
      cycle(arr, F + 6, R + 6, B + 6, L + 6)
      cycle(arr, F + 7, R + 7, B + 7, L + 7)
      cycle(arr, F + 8, R + 8, B + 8, L + 8)
      break
    case 'R':
      spinCW(arr, R)
      cycle(arr, F + 2, U + 2, B + 0, D + 2)
      cycle(arr, F + 5, U + 5, B + 3, D + 5)
      cycle(arr, F + 8, U + 8, B + 6, D + 8)
      break
    case 'L':
      spinCW(arr, L)
      cycle(arr, B + 2, U + 0, F + 0, D + 0)
      cycle(arr, B + 5, U + 3, F + 3, D + 3)
      cycle(arr, B + 8, U + 6, F + 6, D + 6)
      break
    case 'F':
      spinCW(arr, F)
      cycle(arr, U + 6, R + 0, D + 0, L + 8)
      cycle(arr, U + 7, R + 3, D + 1, L + 5)
      cycle(arr, U + 8, R + 6, D + 2, L + 2)
      break
    case 'B':
      spinCW(arr, B)
      cycle(arr, R + 2, U + 0, L + 0, D + 8)
      cycle(arr, R + 5, U + 1, L + 3, D + 7)
      cycle(arr, R + 8, U + 2, L + 6, D + 6)
      break
  }
}

function identityPerm() {
  return Array.from({ length: 54 }, (_, i) => i)
}

export function sourcesForMove(move: ParsedMove): number[] {
  const perm = identityPerm()
  const n = move.turns === 2 ? 2 : 1
  for (let k = 0; k < n; k++) {
    if (move.turns === -1) {
      quarterCW(perm, move.face)
      quarterCW(perm, move.face)
      quarterCW(perm, move.face)
    } else {
      quarterCW(perm, move.face)
    }
  }
  return perm
}

export function applyFacelets(facelets: string, notation: string): string {
  const c = Cube.fromString(facelets)
  c.move(notation)
  return c.asString()
}
