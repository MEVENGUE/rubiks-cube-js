import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const siblingDist = resolve(here, '../frontend/dist')
const localDist = resolve(here, 'dist')
const root = existsSync(localDist) ? localDist : siblingDist
const port = Number(process.env.PORT) || 4173
const host = process.env.HOST || '0.0.0.0'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

function safePath(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0])
  const resolved = resolve(join(root, normalize(clean)))
  if (!resolved.startsWith(root)) return join(root, 'index.html')
  return resolved
}

async function send(res, file, code = 200) {
  const body = await readFile(file)
  res.writeHead(code, {
    'content-type': MIME[extname(file)] || 'application/octet-stream',
    'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=31536000',
  })
  res.end(body)
}

const server = createServer(async (req, res) => {
  try {
    let file = safePath(req.url)
    const info = await stat(file).catch(() => null)
    if (info?.isDirectory()) file = join(file, 'index.html')
    if (!info || info.isDirectory()) {
      await send(res, join(root, 'index.html'))
      return
    }
    await send(res, file)
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Erreur serveur')
  }
})

server.listen(port, host, () => {
  console.log(`Rubik Graph → http://${host}:${port}`)
})
