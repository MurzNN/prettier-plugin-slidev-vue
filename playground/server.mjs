import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { format } from 'prettier'
import plugin from '../index.js'

const port = Number(process.env.PORT ?? 3000)
const options = { parser: 'slidev', plugins: [plugin], filepath: 'slides.md' }
const exampleUrl = new URL('./example.md', import.meta.url)
const pageUrl = new URL('./index.html', import.meta.url)

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(data))
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(await readFile(pageUrl))
    return
  }

  if (request.method === 'GET' && request.url === '/api/example') {
    sendJson(response, 200, { source: await readFile(exampleUrl, 'utf8') })
    return
  }

  if (request.method === 'POST' && request.url === '/api/format') {
    let payload
    try {
      payload = JSON.parse(await readRequestBody(request))
    } catch (error) {
      sendJson(response, 400, { error: `Invalid request: ${error.message}` })
      return
    }

    if (
      payload === null
      || typeof payload !== 'object'
      || Array.isArray(payload)
      || typeof payload.source !== 'string'
    ) {
      sendJson(response, 400, { error: 'Request must include a string source.' })
      return
    }

    try {
      sendJson(response, 200, { formatted: await format(payload.source, options) })
    } catch (error) {
      sendJson(response, 422, { error: error.message })
    }
    return
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end('Not found')
})

async function readRequestBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

server.listen(port, '127.0.0.1', () => {
  console.log(`Playground: http://127.0.0.1:${port}`)
})
