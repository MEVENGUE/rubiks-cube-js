import './style.css'
import * as THREE from 'three'
import { CubeModel } from './cube/model'
import { CubeView } from './cube/view3d'
import { parseMove, invertMove, isOuterFace } from './cube/notation'
import { GraphView } from './graph/view'
import { RobotView } from './robot/view3d'
import { HandEngine, type Tracked } from './gestures/hands'
import { initI18n, t, type MsgKey } from './i18n'

const model = new CubeModel()
const canvas = document.querySelector<HTMLCanvasElement>('#cube-canvas')!
const graphCanvas = document.querySelector<HTMLCanvasElement>('#graph-canvas')!
const robotCanvas = document.querySelector<HTMLCanvasElement>('#robot-canvas')!
const view = new CubeView(canvas)
const graph = new GraphView(graphCanvas)
const robot = new RobotView(robotCanvas)

const solvedPill = document.querySelector('#solved-pill')!
const movePill = document.querySelector('#move-pill')!
const gesturePill = document.querySelector('#gesture-pill')!
const hint = document.querySelector('#hint')!
const pathEl = document.querySelector('#path')!
const solverState = document.querySelector('#solver-state')!
const camBox = document.querySelector('#cam-box')!
const cursorEl = document.querySelector<HTMLDivElement>('#cursor')!
const webcam = document.querySelector<HTMLVideoElement>('#webcam')!
const overlay = document.querySelector<HTMLCanvasElement>('#hands-overlay')!

const btnScramble = document.querySelector<HTMLButtonElement>('#btn-scramble')!
const btnReset = document.querySelector<HTMLButtonElement>('#btn-reset')!
const btnSolve = document.querySelector<HTMLButtonElement>('#btn-solve')!
const btnCamera = document.querySelector<HTMLButtonElement>('#btn-camera')!
const btnSwap = document.querySelector<HTMLButtonElement>('#btn-swap')!
const btnStep = document.querySelector<HTMLButtonElement>('#btn-step')!
const btnBack = document.querySelector<HTMLButtonElement>('#btn-back')!
const btnPlay = document.querySelector<HTMLButtonElement>('#btn-play')!
const btnStop = document.querySelector<HTMLButtonElement>('#btn-stop')!
const btnRobotSolve = document.querySelector<HTMLButtonElement>('#btn-robot-solve')!
const tabGraph = document.querySelector<HTMLButtonElement>('#tab-graph')!
const tabRobot = document.querySelector<HTMLButtonElement>('#tab-robot')!
const btnAbout = document.querySelector<HTMLButtonElement>('#btn-about')!
const btnAboutClose = document.querySelector<HTMLButtonElement>('#btn-about-close')!
const aboutOverlay = document.querySelector<HTMLElement>('#about-overlay')!
const btnHelp = document.querySelector<HTMLButtonElement>('#btn-help')!
const btnHelpClose = document.querySelector<HTMLButtonElement>('#btn-help-close')!
const helpOverlay = document.querySelector<HTMLElement>('#help-overlay')!
const panelTitle = document.querySelector('#panel-title')!
const panelCopy = document.querySelector('#panel-copy')!
const robotHud = document.querySelector<HTMLElement>('#robot-hud')!
const robotAction = document.querySelector('#robot-action')!
const solProgress = document.querySelector('#sol-progress')!
const solBar = document.querySelector<HTMLElement>('#sol-bar')!
const vizStage = document.querySelector('#viz-stage')!

type SolverNote =
  | { kind: 'key'; key: MsgKey }
  | { kind: 'moves'; n: number }
  | { kind: 'raw'; text: string }
type RobotLabel = { kind: 'key'; key: MsgKey } | { kind: 'text'; text: string }

let solverNote: SolverNote = { kind: 'key', key: 'solverPreparing' }
let robotLabel: RobotLabel = { kind: 'key', key: 'robotRest' }
let panelMode: 'graph' | 'robot' = 'graph'
let gestureState: 'off' | 'on' | 'denied' = 'off'

const worker = new Worker('/solver-worker.js')
let solverReady = false
let solution: string[] = []
let solIndex = 0
let playing = false
let awaitingSolution = false
let cameraOn = false
let solveTicket = 0
let solvePending = false
let solveRetries = 0
const hands = new HandEngine(webcam, overlay)

worker.postMessage({ type: 'init' })
worker.onerror = () => {
  setSolver({ kind: 'key', key: 'solverError' })
}
worker.onmessage = (e: MessageEvent) => {
  const msg = e.data
  if (msg.type === 'ready') {
    solverReady = true
    setSolver({ kind: 'key', key: 'solverReady' })
    btnSolve.disabled = false
  } else if (msg.type === 'solution') {
    if (typeof msg.id === 'number' && msg.id !== solveTicket) return
    solvePending = false
    const alg = String(msg.solution || '').trim()
    solution = alg ? alg.split(/\s+/) : []
    solIndex = 0
    playing = solution.length > 0
    graph.setFacelets(model.facelets())
    renderPath()
    setSolver(
      solution.length
        ? { kind: 'moves', n: solution.length }
        : { kind: 'key', key: 'solverDone' },
    )
    syncTransport()
    if (playing) issueSolutionMove()
    else refreshHud()
  } else if (msg.type === 'error') {
    if (typeof msg.id === 'number' && msg.id !== solveTicket) return
    solvePending = false
    setSolver({ kind: 'raw', text: String(msg.message || '') })
  }
}

btnSolve.disabled = true

function paintSolver() {
  if (solverNote.kind === 'moves') solverState.textContent = t('solverMoves', { n: solverNote.n })
  else if (solverNote.kind === 'raw') solverState.textContent = solverNote.text
  else solverState.textContent = t(solverNote.key)
}

function setSolver(note: SolverNote) {
  solverNote = note
  paintSolver()
}

function setPanel(mode: 'graph' | 'robot') {
  panelMode = mode
  const robotOn = mode === 'robot'
  tabGraph.setAttribute('aria-selected', robotOn ? 'false' : 'true')
  tabRobot.setAttribute('aria-selected', robotOn ? 'true' : 'false')
  graphCanvas.classList.toggle('is-active', !robotOn)
  robotCanvas.classList.toggle('is-active', robotOn)
  robotHud.hidden = !robotOn
  robot.active = robotOn
  panelTitle.textContent = t(robotOn ? 'panelRobot' : 'panelGraph')
  panelCopy.innerHTML = t(robotOn ? 'copyRobot' : 'copyGraph')
  graph.resize()
  robot.resize()
}

function setRobotAction(label: RobotLabel) {
  robotLabel = label
  robotAction.textContent = label.kind === 'text' ? label.text : t(label.key)
}

function refreshHud() {
  const solved = model.isSolved()
  solvedPill.textContent = t(solved ? 'solved' : 'scrambled')
  solvedPill.classList.toggle('ok', solved)
  movePill.textContent = t('moveCount', { n: model.moveCount })
  if (!graph.busy) {
    graph.setFacelets(model.facelets())
    graph.draw()
  }
}

function moveDuration(move: { turns: number }) {
  return Math.abs(move.turns) === 2 ? 980 : 760
}

function followDuration(move: { turns: number }) {
  return Math.abs(move.turns) === 2 ? 460 : 320
}

function requestSolve() {
  if (!solverReady || view.busy) return false
  if (model.isSolved()) {
    playing = false
    setSolver({ kind: 'key', key: 'solverDone' })
    setRobotAction({ kind: 'key', key: 'robotSolved' })
    refreshHud()
    syncTransport()
    return false
  }
  const id = ++solveTicket
  solvePending = true
  setSolver({ kind: 'key', key: 'solverSearching' })
  graph.setFacelets(model.facelets())
  graph.highlight = null
  graph.draw()
  worker.postMessage({ type: 'solve', facelets: model.facelets(), id })
  return true
}

function startTurn(parsed: ReturnType<typeof parseMove>) {
  if (!parsed || view.busy) return false
  graph.playMove(parsed, model.facelets(), moveDuration(parsed))
  view.enqueue(parsed)
  robot.enqueue(parsed)
  setRobotAction({ kind: 'text', text: parsed.notation })
  return true
}

function clearSolution() {
  playing = false
  solution = []
  solIndex = 0
  awaitingSolution = false
  pathEl.innerHTML = ''
  graph.highlight = null
  solProgress.textContent = '—'
  solBar.style.width = '0%'
  syncTransport()
}

function syncTransport() {
  const has = solution.length > 0
  const busy = view.busy
  btnBack.disabled = !has || solIndex <= 0 || busy
  btnStep.disabled = !has || solIndex >= solution.length || busy
  btnPlay.disabled = !has || solIndex >= solution.length
  btnStop.disabled = !has
}

function renderPath() {
  pathEl.innerHTML = ''
  solution.forEach((tok, i) => {
    const chip = document.createElement('span')
    chip.className = 'chip'
    if (i < solIndex) chip.classList.add('done')
    if (i === solIndex) chip.classList.add('now')
    chip.textContent = tok
    chip.title = t('replayMove')
    chip.addEventListener('click', () => replayMoveAt(i))
    pathEl.appendChild(chip)
  })
  const n = solution.length
  const at = Math.min(solIndex, n)
  solProgress.textContent = n ? `${at} / ${n}` : '—'
  solBar.style.width = n ? `${(at / n) * 100}%` : '0%'
  const now = pathEl.querySelector<HTMLElement>('.chip.now')
  now?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  syncTransport()
}

function issueSolutionMove(fromPlay = false) {
  if (fromPlay && !playing) return
  if (view.busy) {
    if (playing) requestAnimationFrame(() => issueSolutionMove(true))
    return
  }
  if (solIndex >= solution.length) {
    playing = false
    if (!model.isSolved() && solveRetries < 2 && solverReady) {
      solveRetries += 1
      setSolver({ kind: 'key', key: 'solverRecalc' })
      setRobotAction({ kind: 'key', key: 'robotRecalc' })
      solution = []
      solIndex = 0
      pathEl.innerHTML = ''
      const retry = () => {
        if (view.busy) {
          requestAnimationFrame(retry)
          return
        }
        if (!requestSolve()) refreshHud()
      }
      retry()
      return
    }
    solveRetries = 0
    graph.highlight = null
    if (!graph.busy) {
      graph.setFacelets(model.facelets())
      graph.draw()
    }
    setRobotAction({ kind: 'key', key: model.isSolved() ? 'robotSolved' : 'robotRest' })
    refreshHud()
    syncTransport()
    return
  }
  const tok = solution[solIndex]
  const parsed = parseMove(tok)
  if (!parsed) {
    solIndex += 1
    issueSolutionMove()
    return
  }
  graph.highlight = isOuterFace(parsed.face) ? parsed.face : null
  renderPath()
  awaitingSolution = true
  startTurn(parsed)
}

function jumpToIndex(target: number) {
  if (target < 0) target = 0
  if (target > solution.length) target = solution.length
  if (target === solIndex) return
  const batch: ReturnType<typeof parseMove>[] = []
  if (target < solIndex) {
    for (let i = solIndex - 1; i >= target; i--) {
      const parsed = parseMove(solution[i])
      if (parsed) batch.push(invertMove(parsed))
    }
  } else {
    for (let i = solIndex; i < target; i++) {
      const parsed = parseMove(solution[i])
      if (parsed) batch.push(parsed)
    }
  }
  const moves = batch.filter((m): m is NonNullable<typeof m> => m !== null)
  for (const m of moves) model.apply(m.notation)
  view.applyInstant(moves)
  robot.applyInstant(moves)
  solIndex = target
  graph.setFacelets(model.facelets())
  const current = solIndex < solution.length ? parseMove(solution[solIndex]) : null
  graph.highlight = current && isOuterFace(current.face) ? current.face : null
  graph.draw()
  refreshHud()
  renderPath()
}

function replayMoveAt(index: number) {
  if (view.busy) return
  if (index < 0 || index >= solution.length) return
  playing = false
  awaitingSolution = false
  jumpToIndex(index)
  issueSolutionMove()
}

view.onCommit = (notation, source) => {
  const parsed = parseMove(notation)
  if (source === 'user') {
    const resume = playing || awaitingSolution || solvePending || solution.length > 0
    clearSolution()
    if (parsed) {
      graph.playMove(parsed, model.facelets(), followDuration(parsed))
      robot.enqueue(parsed)
      setRobotAction({ kind: 'text', text: parsed.notation })
    }
    model.apply(notation)
    refreshHud()
    if (resume) requestSolve()
    return
  }
  model.apply(notation)
  refreshHud()
  if (awaitingSolution) {
    awaitingSolution = false
    solIndex += 1
    renderPath()
    if (playing) requestAnimationFrame(() => issueSolutionMove(true))
  }
}

view.onBusyChange = () => {
  const lock = view.busy
  btnScramble.disabled = lock
  btnSolve.disabled = lock || !solverReady
  syncTransport()
}

btnScramble.addEventListener('click', () => {
  if (view.busy) return
  clearSolution()
  model.reset()
  view.resetVisual()
  robot.resetVisual()
  const moves = model.scramble(24)
  const parsed = moves.map(parseMove).filter((m) => m !== null)
  view.applyInstant(parsed)
  robot.applyInstant(parsed)
  model.moveCount = 0
  setRobotAction({ kind: 'key', key: 'robotRest' })
  refreshHud()
})

btnReset.addEventListener('click', () => {
  clearSolution()
  model.reset()
  view.resetVisual()
  robot.resetVisual()
  setRobotAction({ kind: 'key', key: 'robotRest' })
  refreshHud()
})

btnSolve.addEventListener('click', () => {
  if (!solverReady || view.busy) return
  clearSolution()
  solveRetries = 0
  requestSolve()
})

btnBack.addEventListener('click', () => {
  playing = false
  if (solIndex <= 0) return
  replayMoveAt(solIndex - 1)
})

btnStep.addEventListener('click', () => {
  playing = false
  issueSolutionMove()
})

btnPlay.addEventListener('click', () => {
  if (solIndex >= solution.length) return
  playing = true
  issueSolutionMove()
})

btnStop.addEventListener('click', () => {
  playing = false
  setRobotAction({ kind: 'key', key: 'robotPause' })
})

tabGraph.addEventListener('click', () => setPanel('graph'))
tabRobot.addEventListener('click', () => setPanel('robot'))

function openAbout() {
  helpOverlay.hidden = true
  aboutOverlay.hidden = false
  btnAboutClose.focus()
}

function closeAbout() {
  if (aboutOverlay.hidden) return
  aboutOverlay.hidden = true
  btnAbout.focus()
}

function openHelp() {
  aboutOverlay.hidden = true
  helpOverlay.hidden = false
  btnHelpClose.focus()
}

function closeHelp() {
  if (helpOverlay.hidden) return
  helpOverlay.hidden = true
  btnHelp.focus()
}

btnAbout.addEventListener('click', openAbout)
btnAboutClose.addEventListener('click', closeAbout)
aboutOverlay.addEventListener('click', (e) => {
  if (e.target === aboutOverlay) closeAbout()
})
btnHelp.addEventListener('click', openHelp)
btnHelpClose.addEventListener('click', closeHelp)
helpOverlay.addEventListener('click', (e) => {
  if (e.target === helpOverlay) closeHelp()
})
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (!helpOverlay.hidden) closeHelp()
  else closeAbout()
})

btnRobotSolve.addEventListener('click', () => {
  setPanel('robot')
  if (view.busy) return
  if (model.isSolved()) {
    setSolver({ kind: 'key', key: 'solverDone' })
    setRobotAction({ kind: 'key', key: 'robotSolved' })
    return
  }
  setRobotAction({ kind: 'key', key: 'robotPlan' })
  if (solution.length > 0 && solIndex < solution.length && !solvePending) {
    playing = true
    issueSolutionMove()
    return
  }
  if (!solverReady) {
    setSolver({ kind: 'key', key: 'solverUnavailable' })
    return
  }
  clearSolution()
  solveRetries = 0
  requestSolve()
})

document.querySelector('#move-buttons')!.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button')
  const tok = btn?.dataset.move
  if (!tok || view.busy) return
  const parsed = parseMove(tok)
  if (!parsed) return
  clearSolution()
  startTurn(parsed)
})

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
  if (!aboutOverlay.hidden || !helpOverlay.hidden) return
  const k = e.key
  if (k === 'ArrowLeft') {
    e.preventDefault()
    btnBack.click()
    return
  }
  if (k === 'ArrowRight') {
    e.preventDefault()
    btnStep.click()
    return
  }
  if (k === 's' || k === 'S') {
    btnScramble.click()
    return
  }
  if (k === 'z' || k === 'Z') {
    btnReset.click()
    return
  }
  if (k === 'h' || k === 'H') {
    hands.swap = !hands.swap
    return
  }
  const map: Record<string, string> = {
    u: 'U', U: "U'",
    r: 'R', R: "R'",
    f: 'F', F: "F'",
    d: 'D', D: "D'",
    l: 'L', L: "L'",
    b: 'B', B: "B'",
  }
  const tok = map[k]
  if (!tok || view.busy) return
  const parsed = parseMove(tok)
  if (!parsed) return
  clearSolution()
  startTurn(parsed)
})

type PointerDrag = {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  lastT: number
  hit: NonNullable<ReturnType<CubeView['hitSticker']>>
  locked: boolean
  sign: number
  dir: THREE.Vector2 | null
}
let pointerDrag: PointerDrag | null = null
const activePointers = new Set<number>()

function releaseTurn(commit: boolean, flickSign = 0) {
  const locked = pointerDrag?.locked ?? false
  if (locked) {
    if (commit) {
      if (flickSign) view.kickDrag(flickSign)
      view.settleDrag()
    } else {
      view.updateDrag(0)
      view.settleDrag()
      if (!graph.busy && solution.length === 0) {
        graph.highlight = null
        graph.draw()
      }
    }
  }
  if (pointerDrag) {
    try {
      canvas.releasePointerCapture(pointerDrag.pointerId)
    } catch {
      /* le pointeur a déjà été relâché */
    }
  }
  pointerDrag = null
  view.holdOrbit = false
  canvas.classList.remove('dragging')
}

canvas.addEventListener('pointerdown', (e) => {
  activePointers.add(e.pointerId)
  if (activePointers.size > 1) {
    releaseTurn(false)
    return
  }
  if (view.busy) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const hit = view.hitSticker(e.clientX, e.clientY)
  if (!hit) return
  e.stopPropagation()
  try {
    canvas.setPointerCapture(e.pointerId)
  } catch {
    /* le pointeur n’est plus capturable */
  }
  canvas.classList.add('dragging')
  view.holdOrbit = true
  view.controls.enabled = false
  pointerDrag = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    lastT: performance.now(),
    hit,
    locked: false,
    sign: 1,
    dir: null,
  }
})

canvas.addEventListener('pointermove', (e) => {
  if (!pointerDrag || e.pointerId !== pointerDrag.pointerId) return
  if (activePointers.size > 1) return
  const dx = e.clientX - pointerDrag.startX
  const dy = e.clientY - pointerDrag.startY
  const now = performance.now()
  if (!pointerDrag.locked) {
    const lockPx = e.pointerType === 'mouse' ? 5 : 8
    if (Math.hypot(dx, dy) < lockPx) return
    const picked = view.dragAxisFrom(
      pointerDrag.hit.normal,
      new THREE.Vector2(dx, dy),
      pointerDrag.hit.cubie,
    )
    if (!picked || !view.beginDrag(picked.axis, picked.layer)) {
      releaseTurn(false)
      return
    }
    pointerDrag.locked = true
    pointerDrag.sign = picked.sign || 1
    pointerDrag.dir = picked.dir
  }
  pointerDrag.lastX = e.clientX
  pointerDrag.lastY = e.clientY
  pointerDrag.lastT = now
  const face = view.dragFace()
  if (face && !graph.busy) {
    graph.highlight = face
    graph.draw()
  }
  if (!pointerDrag.dir) return
  const pixels = new THREE.Vector2(dx, dy).dot(pointerDrag.dir) * pointerDrag.sign
  const per90 = e.pointerType === 'mouse' ? 78 : 62
  view.updateDrag((pixels / per90) * 90)
})

function endPointer(e: PointerEvent) {
  activePointers.delete(e.pointerId)
  if (!pointerDrag || e.pointerId !== pointerDrag.pointerId) return
  let flick = 0
  if (pointerDrag.locked && pointerDrag.dir) {
    const dt = Math.max(16, performance.now() - pointerDrag.lastT)
    const speed =
      new THREE.Vector2(e.clientX - pointerDrag.lastX, e.clientY - pointerDrag.lastY).dot(
        pointerDrag.dir,
      ) *
      pointerDrag.sign /
      dt
    if (Math.abs(speed) > 0.4) flick = Math.sign(speed)
  }
  releaseTurn(true, flick)
}

canvas.addEventListener('pointerup', endPointer)
canvas.addEventListener('pointercancel', (e) => {
  activePointers.delete(e.pointerId)
  if (pointerDrag && e.pointerId === pointerDrag.pointerId) releaseTurn(false)
})

function paintCamera() {
  btnCamera.textContent = t(cameraOn ? 'cameraStop' : 'cameraStart')
  btnSwap.hidden = !cameraOn
  gesturePill.textContent = t(
    gestureState === 'on' ? 'gesturesOn' : gestureState === 'denied' ? 'cameraDenied' : 'gesturesOff',
  )
  gesturePill.classList.toggle('busy', gestureState === 'on')
  hint.textContent = t(cameraOn ? 'hintCamera' : 'hintIdle')
}

btnCamera.addEventListener('click', async () => {
  if (cameraOn) {
    hands.stop()
    cameraOn = false
    gestureState = 'off'
    camBox.classList.remove('on')
    cursorEl.classList.add('hidden')
    paintCamera()
    return
  }
  try {
    await hands.start()
    cameraOn = true
    gestureState = 'on'
    camBox.classList.add('on')
    syncCamOverlay()
    paintCamera()
  } catch {
    gestureState = 'denied'
    paintCamera()
  }
})

btnSwap.addEventListener('click', () => {
  hands.swap = !hands.swap
})

type GestureLock = {
  lastCentroid: { x: number; y: number } | null
  pinchWas: boolean
  dragLocked: boolean
  angle: number
  origin: { x: number; y: number }
}
const gstate: GestureLock = {
  lastCentroid: null,
  pinchWas: false,
  dragLocked: false,
  angle: 0,
  origin: { x: 0, y: 0 },
}

function stagePointFromIndex(index: { x: number; y: number }) {
  const rect = canvas.getBoundingClientRect()
  const x = (1 - index.x) * rect.width + rect.left
  const y = index.y * rect.height + rect.top
  return { x, y, clientX: x, clientY: y }
}

function applyGestures(tracked: Tracked[]) {
  const left = tracked.find((h) => h.side === 'Left')
  const right = tracked.find((h) => h.side === 'Right')

  if (left?.open && !right?.pinch && !view.busy) {
    if (gstate.lastCentroid) {
      const dx = (left.centroid.x - gstate.lastCentroid.x) * 4.2
      const dy = (left.centroid.y - gstate.lastCentroid.y) * 4.2
      view.nudgeOrbit(dx, dy)
    }
    gstate.lastCentroid = { ...left.centroid }
  } else {
    gstate.lastCentroid = left ? { ...left.centroid } : null
  }

  if (!right) {
    cursorEl.classList.add('hidden')
    if (gstate.pinchWas && gstate.dragLocked) view.settleDrag()
    gstate.pinchWas = false
    gstate.dragLocked = false
    return
  }

  const pt = stagePointFromIndex(right.index)
  cursorEl.classList.remove('hidden')
  cursorEl.style.left = `${pt.x - canvas.getBoundingClientRect().left}px`
  cursorEl.style.top = `${pt.y - canvas.getBoundingClientRect().top}px`
  cursorEl.classList.toggle('pinch', right.pinch)

  const rising = right.pinch && !gstate.pinchWas
  const falling = !right.pinch && gstate.pinchWas
  gstate.pinchWas = right.pinch

  if (rising && !view.busy) {
    const hit = view.hitSticker(pt.clientX, pt.clientY)
    if (hit) {
      gstate.origin = { x: pt.clientX, y: pt.clientY }
      gstate.dragLocked = false
      gstate.angle = 0
      ;(gstate as GestureLock & { hit?: typeof hit }).hit = hit
    }
  }

  if (right.pinch) {
    const hit = (gstate as GestureLock & { hit?: NonNullable<ReturnType<CubeView['hitSticker']>> }).hit
    if (hit) {
      const dx = pt.clientX - gstate.origin.x
      const dy = pt.clientY - gstate.origin.y
      if (!gstate.dragLocked && Math.hypot(dx, dy) > 16) {
        const picked = view.dragAxisFrom(hit.normal, new THREE.Vector2(dx, dy), hit.cubie)
        if (picked && view.beginDrag(picked.axis, picked.layer)) gstate.dragLocked = true
      }
      if (gstate.dragLocked) {
        view.updateDrag(dx * 0.55)
      }
    }
  }

  if (falling && gstate.dragLocked) {
    view.settleDrag()
    gstate.dragLocked = false
  }
}

function loop() {
  view.tick()
  graph.tick()
  robot.tick()
  if (cameraOn) applyGestures(hands.detect())
  syncTransport()
  requestAnimationFrame(loop)
}

function syncCamOverlay() {
  const rect = webcam.getBoundingClientRect()
  const w = Math.max(1, Math.round(rect.width))
  const h = Math.max(1, Math.round(rect.height))
  if (overlay.width !== w) overlay.width = w
  if (overlay.height !== h) overlay.height = h
}

const ro = new ResizeObserver(() => {
  view.resize()
  graph.resize()
  robot.resize()
  if (cameraOn) syncCamOverlay()
})
ro.observe(canvas.parentElement!)
ro.observe(vizStage)
ro.observe(camBox)

function paintChrome() {
  paintSolver()
  setRobotAction(robotLabel)
  setPanel(panelMode)
  refreshHud()
  paintCamera()
  if (solution.length) renderPath()
}

const langSelect = document.querySelector<HTMLSelectElement>('#lang-select')!
initI18n(langSelect, paintChrome)
graph.resize()
robot.resize()
view.resize()
loop()
