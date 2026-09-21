import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { FACE_HEX, FACE_TWIST, MOVE_TWIST, type Axis, type Face, type MoveFace, type ParsedMove } from './notation'

const STEP = 1.05
const CUBIE = 0.96
const STICKER = 0.82

type Cubie = {
  group: THREE.Group
  grid: THREE.Vector3
  ori: THREE.Quaternion
}

type Anim =
  | {
      mode: 'auto' | 'settle'
      axis: Axis
      layer: -1 | 0 | 1 | null
      from: number
      target: number
      t0: number
      dur: number
      ids: number[]
      notation?: string
    }
  | {
      mode: 'drag'
      axis: Axis
      layer: -1 | 0 | 1
      angle: number
      ids: number[]
    }

const AXIS_VEC = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
]

function faceOnLayer(axis: Axis, layer: number): Face | null {
  for (const [face, spec] of Object.entries(FACE_TWIST) as [Face, (typeof FACE_TWIST)[Face]][]) {
    if (spec.axis === axis && spec.layer === layer) return face
  }
  return null
}

export class CubeView {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  readonly controls: OrbitControls
  readonly raycaster = new THREE.Raycaster()
  readonly pointer = new THREE.Vector2()

  cubies: Cubie[] = []
  private stickerMeshes: THREE.Mesh[] = []
  private anim: Anim | null = null
  private queue: ParsedMove[] = []
  private orbitFrozen = false
  holdOrbit = false
  onCommit: ((notation: string, source: 'user' | 'script') => void) | null = null
  onBusyChange: ((busy: boolean) => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color(0x0e0d0b)
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80)
    this.camera.position.set(5.6, 4.4, 7.2)
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enablePan = false
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 5
    this.controls.maxDistance = 16
    const coarse = matchMedia('(pointer: coarse)').matches
    this.controls.rotateSpeed = coarse ? 1.15 : 0.9
    this.controls.zoomSpeed = coarse ? 1.2 : 1
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
    this.controls.touches.ONE = THREE.TOUCH.ROTATE
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE

    const amb = new THREE.AmbientLight(0xffffff, 0.72)
    const key = new THREE.DirectionalLight(0xfff4e8, 1.05)
    key.position.set(6, 10, 7)
    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.28)
    fill.position.set(-8, -2, -4)
    this.scene.add(amb, key, fill)

    this.buildCubies()
    this.resize()
  }

  get busy() {
    return this.anim !== null || this.queue.length > 0
  }

  resize() {
    const canvas = this.renderer.domElement
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === 0 || h === 0) return
    this.camera.aspect = w / h
    this.camera.fov = w / h < 0.9 ? 50 : 36
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  resetVisual() {
    this.clearAnim()
    this.queue = []
    for (const c of this.cubies) this.scene.remove(c.group)
    this.buildCubies()
    this.onBusyChange?.(false)
  }

  enqueue(move: ParsedMove) {
    this.queue.push(move)
    this.kick()
  }

  enqueueMany(moves: ParsedMove[]) {
    this.queue.push(...moves)
    this.kick()
  }

  applyInstant(moves: ParsedMove[]) {
    this.clearAnim()
    this.queue = []
    for (const m of moves) this.twist(m.face, m.turns, false)
    this.onBusyChange?.(false)
  }

  beginDrag(axis: Axis, layer: -1 | 0 | 1) {
    if (this.anim) return false
    this.controls.enabled = false
    this.orbitFrozen = true
    const ids = this.idsOn(axis, layer)
    this.anim = { mode: 'drag', axis, layer, angle: 0, ids }
    this.onBusyChange?.(true)
    return true
  }

  updateDrag(angleDeg: number) {
    if (!this.anim || this.anim.mode !== 'drag') return
    const clamped = Math.max(-120, Math.min(120, angleDeg))
    this.anim.angle = clamped
    this.paintLayer(this.anim.axis, this.anim.ids, clamped)
  }

  settleDrag() {
    if (!this.anim || this.anim.mode !== 'drag') return
    const a = this.anim.angle
    const target = Math.abs(a) >= 28 ? 90 * Math.sign(a) : 0
    this.anim = {
      mode: 'settle',
      axis: this.anim.axis,
      layer: this.anim.layer,
      from: a,
      target,
      t0: performance.now(),
      dur: 160,
      ids: this.anim.ids,
    }
  }

  /** Pousse un glisser encore timide pour qu’un geste vif valide le quart de tour. */
  kickDrag(sign: number) {
    if (!this.anim || this.anim.mode !== 'drag' || !sign) return
    const a = this.anim.angle
    if (Math.abs(a) >= 28 && Math.sign(a) === sign) return
    this.anim.angle = sign * 36
  }

  hitSticker(clientX: number, clientY: number): { cubie: Cubie; normal: THREE.Vector3; point: THREE.Vector3 } | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const targets = this.cubies.flatMap((c) => c.group.children)
    const hits = this.raycaster.intersectObjects(targets, false)
    const hit = hits[0]
    if (!hit) return null
    const cubie = this.cubies.find((c) => c.group === hit.object.parent)
    if (!cubie) return null
    const normal = new THREE.Vector3()
    if (hit.face) normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize()
    return { cubie, normal, point: hit.point.clone() }
  }

  screenToNdc(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * 2 - 1,
      y: -((clientY - rect.top) / rect.height) * 2 + 1,
    }
  }

  dragAxisFrom(normal: THREE.Vector3, screenDelta: THREE.Vector2, cubie: Cubie) {
    const cam = this.camera
    const right = new THREE.Vector3()
    const up = new THREE.Vector3()
    cam.getWorldDirection(new THREE.Vector3())
    right.setFromMatrixColumn(cam.matrixWorld, 0)
    up.setFromMatrixColumn(cam.matrixWorld, 1)
    const worldDrag = right.multiplyScalar(screenDelta.x).add(up.multiplyScalar(-screenDelta.y))
    const n = normal.clone().normalize()
    const onFace = worldDrag.clone().sub(n.multiplyScalar(worldDrag.dot(n)))
    if (onFace.lengthSq() < 1e-8) return null
    const rot = n.clone().cross(onFace).normalize()
    let axis: Axis | null = null
    let best = 0.2
    for (const candidate of [0, 1, 2] as Axis[]) {
      const score = Math.abs(rot.getComponent(candidate))
      if (score > best) {
        best = score
        axis = candidate
      }
    }
    if (axis === null) return null
    const layer = Math.round(cubie.grid.getComponent(axis)) as -1 | 0 | 1
    const tangent = new THREE.Vector3().crossVectors(AXIS_VEC[axis], cubie.grid)
    if (tangent.lengthSq() < 1e-6) tangent.crossVectors(AXIS_VEC[axis], n)
    tangent.normalize()
    const screenT = tangent.clone().project(cam)
    const rect = this.renderer.domElement.getBoundingClientRect()
    const dir = new THREE.Vector2(screenT.x * rect.width * 0.5, -screenT.y * rect.height * 0.5)
    if (dir.lengthSq() < 1e-6) return null
    dir.normalize()
    const sign = Math.sign(screenDelta.dot(dir) || 1)
    return { axis, layer, sign, dir }
  }

  dragFace(): Face | null {
    if (!this.anim || this.anim.mode !== 'drag') return null
    return faceOnLayer(this.anim.axis, this.anim.layer)
  }

  nudgeOrbit(dx: number, dy: number) {
    if (this.orbitFrozen) return
    const offset = this.camera.position.clone().sub(this.controls.target)
    const sph = new THREE.Spherical().setFromVector3(offset)
    sph.theta -= dx
    sph.phi = Math.max(0.18, Math.min(Math.PI - 0.18, sph.phi + dy))
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(sph))
    this.camera.lookAt(this.controls.target)
  }

  tick() {
    try {
      this.stepAnim()
    } catch (err) {
      console.error(err)
      this.clearAnim()
      this.onBusyChange?.(false)
    }
    this.controls.enabled =
      !this.holdOrbit && !this.orbitFrozen && (!this.anim || this.anim.mode === 'auto')
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  private kick() {
    if (this.anim || this.queue.length === 0) return
    const m = this.queue.shift()!
    this.startAuto(m)
  }

  private startAuto(move: ParsedMove) {
    const spec = MOVE_TWIST[move.face]
    const target = spec.dir * move.turns * 90
    const ids = this.idsOn(spec.axis, spec.layer)
    this.orbitFrozen = true
    this.anim = {
      mode: 'auto',
      axis: spec.axis,
      layer: spec.layer,
      from: 0,
      target,
      t0: performance.now(),
      dur: Math.abs(move.turns) === 2 ? 340 : 240,
      ids,
      notation: move.notation,
    }
    this.onBusyChange?.(true)
  }

  private stepAnim() {
    const a = this.anim
    if (!a) return
    if (a.mode === 'drag') return
    const t = Math.min(1, (performance.now() - a.t0) / a.dur)
    const e = t * t * (3 - 2 * t)
    const deg = a.from + (a.target - a.from) * e
    this.paintLayer(a.axis, a.ids, deg)
    if (t < 1) return
    const user = a.mode !== 'auto'
    let notation =
      a.mode === 'auto' ? (a.notation ?? null) : a.layer === null ? null : this.notationFrom(a.axis, a.layer, a.target)
    let bake = a.target
    if (user && bake !== 0 && !notation) bake = 0
    this.bakeLayer(a.axis, a.ids, bake)
    this.clearAnim()
    if (notation && bake !== 0) this.onCommit?.(notation, user ? 'user' : 'script')
    this.orbitFrozen = false
    this.onBusyChange?.(this.queue.length > 0)
    this.kick()
  }

  private notationFrom(axis: Axis, layer: -1 | 0 | 1, targetDeg: number): string | null {
    const turns = Math.round(targetDeg / 90)
    if (!turns) return null
    for (const [face, spec] of Object.entries(MOVE_TWIST) as [MoveFace, (typeof MOVE_TWIST)[MoveFace]][]) {
      if (spec.layer === null || spec.axis !== axis || spec.layer !== layer) continue
      const q = turns / spec.dir
      if (q === 1) return face
      if (q === -1) return `${face}'`
      if (q === 2 || q === -2) return `${face}2`
    }
    return null
  }

  private idsOn(axis: Axis, layer: number | null) {
    if (layer === null) return this.cubies.map((_, i) => i)
    const ids: number[] = []
    this.cubies.forEach((c, i) => {
      if (Math.round(c.grid.getComponent(axis)) === layer) ids.push(i)
    })
    return ids
  }

  private paintLayer(axis: Axis, ids: number[], deg: number) {
    const q = new THREE.Quaternion().setFromAxisAngle(AXIS_VEC[axis], THREE.MathUtils.degToRad(deg))
    for (const i of ids) {
      const c = this.cubies[i]
      c.group.position.copy(c.grid).multiplyScalar(STEP).applyQuaternion(q)
      c.group.quaternion.copy(c.ori).premultiply(q)
    }
  }

  private bakeLayer(axis: Axis, ids: number[], deg: number) {
    if (Math.abs(deg) < 1) {
      this.paintLayer(axis, ids, 0)
      return
    }
    const q = new THREE.Quaternion().setFromAxisAngle(AXIS_VEC[axis], THREE.MathUtils.degToRad(deg))
    for (const i of ids) {
      const c = this.cubies[i]
      c.grid.applyQuaternion(q)
      c.grid.set(Math.round(c.grid.x), Math.round(c.grid.y), Math.round(c.grid.z))
      c.ori.premultiply(q)
      c.group.position.copy(c.grid).multiplyScalar(STEP)
      c.group.quaternion.copy(c.ori)
    }
  }

  private twist(face: MoveFace, turns: number, animate: boolean) {
    if (animate) {
      this.enqueue({ face, turns, notation: `${face}${turns === -1 ? "'" : turns === 2 ? '2' : ''}` })
      return
    }
    const spec = MOVE_TWIST[face]
    this.bakeLayer(spec.axis, this.idsOn(spec.axis, spec.layer), spec.dir * turns * 90)
  }

  private clearAnim() {
    this.anim = null
    this.orbitFrozen = false
    this.controls.enabled = true
  }

  private buildCubies() {
    this.cubies = []
    this.stickerMeshes = []
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a1816,
      roughness: 0.45,
      metalness: 0.08,
    })
    const bodyGeo = new RoundedBoxGeometry(CUBIE, CUBIE, CUBIE, 3, 0.08)
    const stickerGeo = new THREE.PlaneGeometry(STICKER, STICKER)

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue
          const group = new THREE.Group()
          const body = new THREE.Mesh(bodyGeo, bodyMat)
          group.add(body)
          const addSticker = (face: Face, nx: number, ny: number, nz: number) => {
            const mat = new THREE.MeshStandardMaterial({
              color: FACE_HEX[face],
              roughness: 0.32,
              metalness: 0.04,
            })
            const s = new THREE.Mesh(stickerGeo, mat)
            s.position.set(nx, ny, nz).multiplyScalar(CUBIE * 0.51)
            s.lookAt(s.position.clone().multiplyScalar(2))
            s.userData.face = face
            group.add(s)
            this.stickerMeshes.push(s)
          }
          if (x === 1) addSticker('R', 1, 0, 0)
          if (x === -1) addSticker('L', -1, 0, 0)
          if (y === 1) addSticker('U', 0, 1, 0)
          if (y === -1) addSticker('D', 0, -1, 0)
          if (z === 1) addSticker('F', 0, 0, 1)
          if (z === -1) addSticker('B', 0, 0, -1)
          group.position.set(x, y, z).multiplyScalar(STEP)
          this.scene.add(group)
          this.cubies.push({
            group,
            grid: new THREE.Vector3(x, y, z),
            ori: new THREE.Quaternion(),
          })
        }
      }
    }
  }
}
