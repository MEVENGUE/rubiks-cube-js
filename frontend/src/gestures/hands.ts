import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
]

export type Tracked = {
  side: 'Left' | 'Right'
  landmarks: { x: number; y: number; z: number }[]
  open: boolean
  pinch: boolean
  pinchNorm: number
  index: { x: number; y: number }
  centroid: { x: number; y: number }
}

const PINCH_ON = 0.32
const PINCH_OFF = 0.48
const OPEN_RATIO = 0.28

export class HandEngine {
  landmarker: HandLandmarker | null = null
  video: HTMLVideoElement
  overlay: HTMLCanvasElement
  swap = false
  private pinchSticky = new Map<string, boolean>()
  private lastVideoTime = -1

  constructor(video: HTMLVideoElement, overlay: HTMLCanvasElement) {
    this.video = video
    this.overlay = overlay
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    })
    this.video.srcObject = stream
    await this.video.play()

    const fileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
    )
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    })
  }

  stop() {
    const stream = this.video.srcObject as MediaStream | null
    stream?.getTracks().forEach((t) => t.stop())
    this.video.srcObject = null
    this.landmarker?.close()
    this.landmarker = null
  }

  detect(): Tracked[] {
    if (!this.landmarker || this.video.readyState < 2) return []
    const t = this.video.currentTime
    if (t === this.lastVideoTime) return this._last
    this.lastVideoTime = t
    const res = this.landmarker.detectForVideo(this.video, performance.now())
    const out: Tracked[] = []
    const n = res.landmarks.length
    for (let i = 0; i < n; i++) {
      const lm = res.landmarks[i]
      const handed = res.handedness?.[i]?.[0]
      let side: 'Left' | 'Right' = handed?.categoryName === 'Left' ? 'Left' : 'Right'
      if (this.swap) side = side === 'Left' ? 'Right' : 'Left'
      const wrist = lm[0]
      const scale = Math.hypot(lm[17].x - wrist.x, lm[17].y - wrist.y) + 1e-6
      const avg =
        [4, 8, 12, 16, 20].reduce((s, k) => s + Math.hypot(lm[k].x - wrist.x, lm[k].y - wrist.y), 0) / 5
      const pinchNorm = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / scale
      const key = side
      let pinch = this.pinchSticky.get(key) ?? false
      pinch = pinch ? pinchNorm < PINCH_OFF : pinchNorm < PINCH_ON
      this.pinchSticky.set(key, pinch)
      const cx =
        (lm[8].x + lm[12].x + lm[16].x + lm[20].x) / 4
      const cy =
        (lm[8].y + lm[12].y + lm[16].y + lm[20].y) / 4
      out.push({
        side,
        landmarks: lm,
        open: avg / scale > OPEN_RATIO,
        pinch,
        pinchNorm,
        index: { x: lm[8].x, y: lm[8].y },
        centroid: { x: cx, y: cy },
      })
    }
    this._last = out
    this.draw(out)
    return out
  }

  private _last: Tracked[] = []

  private draw(hands: Tracked[]) {
    const ctx = this.overlay.getContext('2d')
    if (!ctx) return
    const w = this.overlay.width
    const h = this.overlay.height
    ctx.clearRect(0, 0, w, h)
    ctx.lineWidth = 2
    for (const hand of hands) {
      ctx.strokeStyle = hand.side === 'Right' ? '#c45c26' : '#1e66c7'
      ctx.fillStyle = ctx.strokeStyle
      for (const [a, b] of CONNECTIONS) {
        const pa = hand.landmarks[a]
        const pb = hand.landmarks[b]
        ctx.beginPath()
        ctx.moveTo(pa.x * w, pa.y * h)
        ctx.lineTo(pb.x * w, pb.y * h)
        ctx.stroke()
      }
      for (const p of hand.landmarks) {
        ctx.beginPath()
        ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}
