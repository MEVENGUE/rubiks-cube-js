import { FACE_HEX, isOuterFace, type Face, type MoveFace, type ParsedMove } from '../cube/notation'
import { buildGraphLayout, type GraphLayout, type Pt } from './layout'
import { applyFacelets, sourcesForMove } from './moves'

type Particle = {
  color: Face
  from: Pt
  to: Pt
  cx: number
  cy: number
}

type Anim = {
  t0: number
  dur: number
  face: MoveFace
  turns: number
  spin: number
  particles: Particle[]
  endFacelets: string
}

const ORDER = 'URFDLB'

function faceletIndex(face: Face, i: number) {
  return ORDER.indexOf(face) * 9 + i
}

function ease(t: number) {
  return t * t * (3 - 2 * t)
}

function signedAngle(from: Pt, to: Pt, c: Pt) {
  const a0 = Math.atan2(from.y - c.y, from.x - c.x)
  const a1 = Math.atan2(to.y - c.y, to.x - c.x)
  let da = a1 - a0
  while (da > Math.PI) da -= Math.PI * 2
  while (da < -Math.PI) da += Math.PI * 2
  return { a0, da }
}

function alongArc(from: Pt, to: Pt, c: Pt, t: number, prefer: number): Pt {
  const { a0, da: short } = signedAngle(from, to, c)
  let da = short
  if (prefer !== 0 && Math.abs(short) > 0.2 && Math.sign(short) !== Math.sign(prefer)) {
    da = short > 0 ? short - Math.PI * 2 : short + Math.PI * 2
  }
  if (Math.abs(prefer) > 2.5 && Math.abs(short) < 0.4) {
    da = prefer > 0 ? Math.PI : -Math.PI
  }
  const r0 = Math.hypot(from.x - c.x, from.y - c.y)
  const r1 = Math.hypot(to.x - c.x, to.y - c.y)
  const r = r0 + (r1 - r0) * t
  const a = a0 + da * t
  return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }
}

type QueuedMove = { move: ParsedMove; startFacelets: string; dur: number }

export class GraphView {
  private ctx: CanvasRenderingContext2D
  private canvas: HTMLCanvasElement
  private layout: GraphLayout | null = null
  private facelets = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'
  highlight: Face | null = null
  private anim: Anim | null = null
  private queue: QueuedMove[] = []

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('graph canvas')
    this.ctx = ctx
    this.canvas = canvas
  }

  get busy() {
    return this.anim !== null || this.queue.length > 0
  }

  setFacelets(s: string) {
    this.anim = null
    this.queue = []
    this.facelets = s
  }

  playMove(move: ParsedMove, startFacelets: string, dur: number) {
    if (this.anim || this.queue.length > 0) {
      this.queue.push({ move, startFacelets, dur })
      if (this.anim && this.queue.length >= 2) {
        const elapsed = performance.now() - this.anim.t0
        this.anim.dur = Math.min(this.anim.dur, elapsed + 140)
      }
      return
    }
    this.beginMove(move, startFacelets, dur)
  }

  private beginMove(move: ParsedMove, startFacelets: string, dur: number) {
    const layout = this.layout
    if (!layout) {
      this.facelets = applyFacelets(startFacelets, move.notation)
      const next = this.queue.shift()
      if (next) this.beginMove(next.move, next.startFacelets, next.dur)
      return
    }
    const backlog = this.queue.length
    const paced = backlog >= 3 ? 150 : backlog >= 1 ? Math.min(dur, 260) : dur
    const src = sourcesForMove(move)
    const anchor = isOuterFace(move.face) ? layout.centers[move.face] : null
    const nodeByFacelet: Pt[] = new Array(54)
    for (const n of layout.nodes) nodeByFacelet[faceletIndex(n.face, n.index)] = n

    const particles: Particle[] = []
    let spinVote = 0
    for (let dest = 0; dest < 54; dest++) {
      const fromI = src[dest]
      if (fromI === dest) continue
      const from = nodeByFacelet[fromI]
      const to = nodeByFacelet[dest]
      if (!from || !to) continue
      const col = startFacelets[fromI] as Face
      const hub = anchor ?? layout.centers[ORDER[Math.floor(dest / 9)] as Face]
      particles.push({ color: col, from, to, cx: hub.x, cy: hub.y })
      spinVote += signedAngle(from, to, hub).da
    }
    const end: string[] = new Array(54)
    for (let i = 0; i < 54; i++) end[i] = startFacelets[src[i]]
    let endFacelets = end.join('')
    const expected = applyFacelets(startFacelets, move.notation)
    if (endFacelets !== expected) endFacelets = expected
    this.anim = {
      t0: performance.now(),
      dur: paced,
      face: move.face,
      turns: move.turns,
      spin: Math.sign(spinVote) || (move.turns === -1 ? 1 : -1),
      particles,
      endFacelets,
    }
    this.highlight = isOuterFace(move.face) ? move.face : null
  }

  tick() {
    if (!this.anim && this.queue.length > 0) {
      const next = this.queue.shift()!
      this.beginMove(next.move, next.startFacelets, next.dur)
    }
    if (!this.anim) return
    const t = Math.min(1, (performance.now() - this.anim.t0) / this.anim.dur)
    this.draw(ease(t))
    if (t < 1) return
    this.facelets = this.anim.endFacelets
    this.anim = null
    const next = this.queue.shift()
    if (!next) {
      this.highlight = null
      this.draw()
      return
    }
    const start = next.startFacelets.length === 54 ? next.startFacelets : this.facelets
    this.beginMove(next.move, start, next.dur)
  }

  resize() {
    const dpr = Math.min(devicePixelRatio, 2)
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    this.canvas.width = Math.max(1, Math.floor(w * dpr))
    this.canvas.height = Math.max(1, Math.floor(h * dpr))
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.layout = buildGraphLayout(w, h)
    this.draw()
  }

  draw(t = 1) {
    const { ctx, canvas, layout } = this
    if (!layout) return
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    ctx.fillStyle = '#f4efe4'
    ctx.fillRect(0, 0, w, h)

    const spinFace = this.anim && isOuterFace(this.anim.face) ? this.anim.face : this.highlight
    const spinAmt = this.anim
      ? this.anim.spin * (Math.abs(this.anim.turns) === 2 ? Math.PI : Math.PI / 2) * t
      : 0
    const size = Math.min(w, h)
    const orbitRadii = [120, 145, 170].map((v) => (v * size) / 540)

    for (const c of layout.circles) {
      const hot = this.anim !== null && c.face === spinFace
      ctx.save()
      ctx.strokeStyle = hot ? 'rgba(196, 92, 38, 0.28)' : '#c5beb0'
      ctx.lineWidth = 1.15
      ctx.beginPath()
      ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    if (this.anim && spinFace && layout.centers[spinFace]) {
      const c = layout.centers[spinFace]
      const maxR = orbitRadii[2] + 8
      ctx.fillStyle = 'rgba(196, 92, 38, 0.10)'
      ctx.beginPath()
      ctx.moveTo(c.x, c.y)
      ctx.arc(c.x, c.y, maxR, -Math.PI / 2, -Math.PI / 2 + spinAmt)
      ctx.closePath()
      ctx.fill()
      for (const rad of orbitRadii) {
        this.drawSpinningOrbit(c.x, c.y, rad, spinAmt, true)
      }
    }

    const r = Math.max(5.5, Math.min(w, h) * 0.016)

    if (this.anim && t < 1) {
      const prefer = this.anim.spin * (Math.abs(this.anim.turns) === 2 ? Math.PI : Math.PI / 2)
      for (const p of this.anim.particles) {
        const center = { x: p.cx, y: p.cy }
        this.strokeArc(p.from, p.to, center, prefer)
        for (let k = 1; k <= 4; k++) {
          const tk = t * (k / 4)
          const ghost = alongArc(p.from, p.to, center, tk, prefer)
          ctx.globalAlpha = 0.16 + 0.12 * k
          this.dot(ghost.x, ghost.y, r * (0.4 + 0.1 * k), p.color, false)
        }
        ctx.globalAlpha = 1
        const pos = alongArc(p.from, p.to, center, t, prefer)
        this.dot(pos.x, pos.y, r + 2.2, p.color, true)
      }
      const src = sourcesForMove({
        face: this.anim.face,
        turns: this.anim.turns,
        notation: '',
      })
      for (const n of layout.nodes) {
        const dest = faceletIndex(n.face, n.index)
        if (src[dest] !== dest) continue
        const ch = this.facelets[dest] as Face
        this.dot(n.x, n.y, r, ch, false)
      }
      this.drawMoveBadge(w, this.anim.face, this.anim.turns)
    } else {
      for (const n of layout.nodes) {
        const fi = faceletIndex(n.face, n.index)
        const ch = this.facelets[fi] as Face
        const active = this.highlight === n.face
        this.dot(n.x, n.y, r + (active ? 1.2 : 0), ch, active)
      }
    }
  }

  private drawSpinningOrbit(cx: number, cy: number, rad: number, spinAmt: number, moving: boolean) {
    const ctx = this.ctx
    ctx.save()
    ctx.strokeStyle = moving ? '#c45c26' : '#c45c26aa'
    ctx.lineWidth = moving ? 2.6 : 1.8
    ctx.setLineDash(moving ? [10, 8] : [])
    ctx.lineDashOffset = moving ? -spinAmt * rad : 0
    ctx.beginPath()
    ctx.arc(cx, cy, rad, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.lineWidth = 2.4
    const ticks = 16
    for (let i = 0; i < ticks; i++) {
      const a = spinAmt + (i / ticks) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * (rad - 6), cy + Math.sin(a) * (rad - 6))
      ctx.lineTo(cx + Math.cos(a) * (rad + 6), cy + Math.sin(a) * (rad + 6))
      ctx.stroke()
    }

    if (moving) {
      for (let i = 0; i < 4; i++) {
        const a = spinAmt + (i / 4) * Math.PI * 2
        const tip = { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad }
        const ahead = a + Math.sign(spinAmt || 1) * 0.22
        this.arrowHead(tip, {
          x: cx + Math.cos(ahead) * rad,
          y: cy + Math.sin(ahead) * rad,
        })
      }
    }
    ctx.restore()
  }

  private strokeArc(from: Pt, to: Pt, c: Pt, prefer: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.strokeStyle = 'rgba(196, 92, 38, 0.45)'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    const steps = 10
    for (let i = 1; i <= steps; i++) {
      const p = alongArc(from, to, c, i / steps, prefer)
      ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
    ctx.restore()
  }

  private arrowHead(from: Pt, to: Pt) {
    const ctx = this.ctx
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.hypot(dx, dy)
    if (len < 0.4) return
    const a = Math.atan2(dy, dx)
    ctx.save()
    ctx.fillStyle = '#c45c26'
    ctx.beginPath()
    ctx.moveTo(to.x, to.y)
    ctx.lineTo(to.x - Math.cos(a - 0.45) * 7, to.y - Math.sin(a - 0.45) * 7)
    ctx.lineTo(to.x - Math.cos(a + 0.45) * 7, to.y - Math.sin(a + 0.45) * 7)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  private drawMoveBadge(w: number, face: MoveFace, turns: number) {
    const ctx = this.ctx
    const label = turns === 2 ? `${face}2` : turns === -1 ? `${face}'` : face
    ctx.save()
    ctx.font = '600 13px "IBM Plex Mono", monospace'
    ctx.fillStyle = '#c45c26'
    ctx.textAlign = 'left'
    ctx.fillText(`${label}  ·  orbites`, 14, 22)
    void w
    ctx.restore()
  }

  private dot(x: number, y: number, r: number, color: Face, hot: boolean) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = FACE_HEX[color] ?? '#888'
    ctx.fill()
    ctx.lineWidth = hot ? 1.6 : 1
    ctx.strokeStyle = hot ? '#c45c26' : '#2a261f'
    ctx.stroke()
  }
}
