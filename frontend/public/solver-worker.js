/* global Cube */
importScripts('/vendor/cube.js', '/vendor/solve.js')

self.onmessage = function (e) {
  const msg = e.data
  if (msg.type === 'init') {
    Cube.initSolver()
    postMessage({ type: 'ready' })
    return
  }
  if (msg.type === 'solve') {
    try {
      const cube = Cube.fromString(msg.facelets)
      const solution = cube.solve() || ''
      const settled = Cube.fromString(msg.facelets)
      if (solution) settled.move(solution)
      const upright = settled.upright() || ''
      const alg = [solution, upright].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
      postMessage({ type: 'solution', solution: alg, id: msg.id })
    } catch (err) {
      postMessage({
        type: 'error',
        message: String(err && err.message ? err.message : err),
        id: msg.id,
      })
    }
  }
}
