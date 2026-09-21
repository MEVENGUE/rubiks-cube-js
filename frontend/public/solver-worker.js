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
      const solution = cube.solve()
      postMessage({ type: 'solution', solution: solution || '' })
    } catch (err) {
      postMessage({ type: 'error', message: String(err && err.message ? err.message : err) })
    }
  }
}
