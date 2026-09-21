import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { FACE_HEX, MOVE_TWIST, type Axis, type Face, type MoveFace, type ParsedMove } from '../cube/notation'

const STEP = 1.05
const CUBIE = 0.96
const STICKER = 0.82
const AXIS_VEC = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
]

type Cubie = {
  group: THREE.Group
  grid: THREE.Vector3
  ori: THREE.Quaternion
}

type Anim = {
  axis: Axis
  from: number
  target: number
  t0: number
  dur: number
  ids: number[]
  notation: string
  wristFrom: number
  wristTo: number
}

const WHITE = 0xf4f6f8
const JOINT = 0x2b3036
const SLATE = 0x6d7580

export class RobotView {
  active = false
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private cubeRoot: THREE.Group
  private cubies: Cubie[] = []
  private queue: ParsedMove[] = []
  private anim: Anim | null = null
  private yaw: THREE.Group
  private lift: THREE.Group
  private elbow: THREE.Group
  private wrist: THREE.Group
  private idleT0: number

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0xe8edf1)
    this.scene.fog = new THREE.Fog(0xe8edf1, 12, 28)

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60)
    this.camera.position.set(3.2, 2.2, 3.6)
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.12

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enablePan = false
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 3.2
    this.controls.maxDistance = 12
    this.controls.target.set(0.35, 1.45, 0)
    this.controls.maxPolarAngle = Math.PI * 0.49

    const hemi = new THREE.HemisphereLight(0xf7fbff, 0xb7c0c8, 0.95)
    const key = new THREE.DirectionalLight(0xffffff, 1.35)
    key.position.set(5, 10, 4)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 24
    key.shadow.camera.left = -6
    key.shadow.camera.right = 6
    key.shadow.camera.top = 6
    key.shadow.camera.bottom = -6
    const fill = new THREE.DirectionalLight(0xd5e4ff, 0.35)
    fill.position.set(-6, 2, -4)
    this.scene.add(hemi, key, fill)

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7.5, 64),
      new THREE.MeshStandardMaterial({ color: 0xdfe5ea, roughness: 0.92, metalness: 0.04 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.scene.add(floor)

    this.yaw = new THREE.Group()
    this.lift = new THREE.Group()
    this.elbow = new THREE.Group()
    this.wrist = new THREE.Group()
    this.buildArm()
    this.idleT0 = performance.now()

    this.cubeRoot = new THREE.Group()
    this.cubeRoot.position.set(0.9, 1.55, 0)
    this.cubeRoot.scale.setScalar(0.28)
    this.scene.add(this.cubeRoot)
    this.buildCubies()
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
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  resetVisual() {
    this.anim = null
    this.queue = []
    for (const c of this.cubies) this.cubeRoot.remove(c.group)
    this.buildCubies()
  }

  enqueue(move: ParsedMove) {
    this.queue.push(move)
    if (this.anim && this.queue.length >= 2) {
      const elapsed = performance.now() - this.anim.t0
      this.anim.dur = Math.min(this.anim.dur, elapsed + 100)
    }
    this.kick()
  }

  applyInstant(moves: ParsedMove[]) {
    this.anim = null
    this.queue = []
    for (const m of moves) this.twist(m.face, m.turns)
  }

  tick() {
    this.stepAnim()
    this.idlePose()
    this.placeHeldCube()
    this.controls.enabled = this.active
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  private placeHeldCube() {
    const hold = new THREE.Vector3(0.52, 0, 0)
    this.wrist.updateWorldMatrix(true, true)
    this.wrist.localToWorld(hold)
    this.cubeRoot.position.copy(hold)
  }

  private kick() {
    if (this.anim || this.queue.length === 0) return
    const move = this.queue.shift()!
    const spec = MOVE_TWIST[move.face]
    const target = spec.dir * move.turns * 90
    const backlog = this.queue.length
    const base = Math.abs(move.turns) === 2 ? 360 : 260
    this.anim = {
      axis: spec.axis,
      from: 0,
      target,
      t0: performance.now(),
      dur: backlog >= 3 ? 110 : backlog >= 1 ? Math.min(base, 160) : base,
      ids: this.idsOn(spec.axis, spec.layer),
      notation: move.notation,
      wristFrom: this.wrist.rotation.z,
      wristTo: this.wrist.rotation.z + THREE.MathUtils.degToRad(target * 0.18),
    }
  }

  private stepAnim() {
    const a = this.anim
    if (!a) return
    const t = Math.min(1, (performance.now() - a.t0) / a.dur)
    const e = t * t * (3 - 2 * t)
    this.paintLayer(a.axis, a.ids, a.from + (a.target - a.from) * e)
    this.wrist.rotation.z = a.wristFrom + (a.wristTo - a.wristFrom) * e
    this.lift.rotation.z = 0.18 + Math.sin(e * Math.PI) * 0.1
    this.elbow.rotation.z = -0.48 - Math.sin(e * Math.PI) * 0.08
    if (t < 1) return
    this.bakeLayer(a.axis, a.ids, a.target)
    this.anim = null
    this.kick()
  }

  private idlePose() {
    if (this.anim) return
    const t = (performance.now() - this.idleT0) * 0.001
    this.yaw.rotation.y = Math.sin(t * 0.45) * 0.08
    this.lift.rotation.z = 0.18 + Math.sin(t * 0.7) * 0.03
    this.elbow.rotation.z = -0.48 + Math.sin(t * 0.55 + 0.4) * 0.03
    this.wrist.rotation.z = Math.sin(t * 0.9) * 0.05
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

  private twist(face: MoveFace, turns: number) {
    const spec = MOVE_TWIST[face]
    this.bakeLayer(spec.axis, this.idsOn(spec.axis, spec.layer), spec.dir * turns * 90)
  }

  private mat(color: number, metal = 0.18, rough = 0.38) {
    return new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough })
  }

  private mesh(geo: THREE.BufferGeometry, color: number, metal?: number, rough?: number) {
    const m = new THREE.Mesh(geo, this.mat(color, metal, rough))
    m.castShadow = true
    m.receiveShadow = true
    return m
  }

  private buildArm() {
    const root = new THREE.Group()
    root.position.set(-1.62, 0, 0)
    this.scene.add(root)

    const base = this.mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.16, 32), SLATE, 0.35, 0.4)
    base.position.y = 0.08
    root.add(base)
    const column = this.mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.12, 24), WHITE, 0.12, 0.45)
    column.position.y = 0.72
    root.add(column)

    this.yaw.position.y = 1.28
    root.add(this.yaw)
    const shoulder = this.mesh(new THREE.SphereGeometry(0.2, 20, 16), JOINT, 0.4, 0.35)
    this.yaw.add(shoulder)
    this.yaw.add(this.lift)

    const upper = this.mesh(new RoundedBoxGeometry(1.55, 0.2, 0.2, 2, 0.04), WHITE)
    upper.position.x = 0.78
    this.lift.add(upper)
    const j1 = this.mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 16), JOINT, 0.4, 0.32)
    j1.rotation.x = Math.PI / 2
    j1.position.x = 1.55
    this.lift.add(j1)

    this.elbow.position.x = 1.55
    this.lift.add(this.elbow)
    const fore = this.mesh(new RoundedBoxGeometry(1.35, 0.17, 0.17, 2, 0.04), WHITE)
    fore.position.x = 0.68
    this.elbow.add(fore)

    this.wrist.position.x = 1.35
    this.elbow.add(this.wrist)
    const palm = this.mesh(new RoundedBoxGeometry(0.24, 0.32, 0.48, 2, 0.04), WHITE)
    this.wrist.add(palm)
    const pad = this.mesh(new RoundedBoxGeometry(0.1, 0.24, 0.2, 1, 0.02), JOINT, 0.25, 0.5)
    pad.position.x = 0.16
    this.wrist.add(pad)

    const fingerGeo = new RoundedBoxGeometry(0.62, 0.09, 0.11, 2, 0.03)
    const f1 = this.mesh(fingerGeo, WHITE)
    f1.position.set(0.42, 0.18, 0)
    f1.rotation.z = -0.22
    const f2 = this.mesh(fingerGeo, WHITE)
    f2.position.set(0.42, -0.18, 0)
    f2.rotation.z = 0.22
    this.wrist.add(f1, f2)

    this.lift.rotation.z = 0.18
    this.elbow.rotation.z = -0.48
  }

  private buildCubies() {
    this.cubies = []
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a1816,
      roughness: 0.45,
      metalness: 0.08,
    })
    const bodyGeo = new RoundedBoxGeometry(CUBIE, CUBIE, CUBIE, 2, 0.08)
    const stickerGeo = new THREE.PlaneGeometry(STICKER, STICKER)

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue
          const group = new THREE.Group()
          const body = new THREE.Mesh(bodyGeo, bodyMat)
          body.castShadow = true
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
            group.add(s)
          }
          if (x === 1) addSticker('R', 1, 0, 0)
          if (x === -1) addSticker('L', -1, 0, 0)
          if (y === 1) addSticker('U', 0, 1, 0)
          if (y === -1) addSticker('D', 0, -1, 0)
          if (z === 1) addSticker('F', 0, 0, 1)
          if (z === -1) addSticker('B', 0, 0, -1)
          group.position.set(x, y, z).multiplyScalar(STEP)
          this.cubeRoot.add(group)
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
