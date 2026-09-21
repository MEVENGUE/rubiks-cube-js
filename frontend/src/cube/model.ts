import Cube from 'cubejs/lib/cube.js'
import { SOLVED } from './notation'

export class CubeModel {
  private cube: Cube
  moveCount = 0
  lastMove = '—'

  constructor() {
    this.cube = new Cube()
  }

  reset() {
    this.cube.identity()
    this.moveCount = 0
    this.lastMove = '—'
  }

  facelets(): string {
    return this.cube.asString()
  }

  isSolved(): boolean {
    return this.facelets() === SOLVED
  }

  apply(notation: string) {
    this.cube.move(notation)
    this.moveCount += 1
    this.lastMove = notation
  }

  scramble(n = 24): string[] {
    const faces = ['U', 'R', 'F', 'D', 'L', 'B']
    const mods = ['', "'", '2']
    const out: string[] = []
    let prev = -1
    while (out.length < n) {
      const f = Math.floor(Math.random() * 6)
      if (f === prev) continue
      prev = f
      out.push(faces[f] + mods[Math.floor(Math.random() * 3)])
    }
    this.cube.move(out.join(' '))
    this.moveCount = 0
    this.lastMove = 'scramble'
    return out
  }

}
