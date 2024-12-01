const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const { randomUUID } = require('crypto')

const nanoid = (size) => randomUUID().replace(/-/g, '').slice(0, size)

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

const clients = new Map()
const PORT = process.env.PORT || 8005

const validateSubdomain = (subdomain) => {
    const pattern = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/
    return pattern.test(subdomain)
}
const MAX_CONNECTIONS = 100

wss.on('connection', (ws, req) => {
    const queryParams = new URL(req.url, 'http://localhost').searchParams
    let subdomain = queryParams.get('subdomain') || nanoid(8)

    if (!validateSubdomain(subdomain)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid subdomain' }))
        ws.close()
        return
    }

    if (clients.has(subdomain)) {
        ws.send(JSON.stringify({ type: 'error', message: `Subdomain ${subdomain} already in use` }))
        ws.close()
    }

    if (clients.size >= MAX_CONNECTIONS) {
        ws.send(JSON.stringify({ type: 'error', message: 'Max connections reached' }))
        ws.close()
        return
    }

    const clientData = {
        ws,
        pendingRequests: new Map(),
        lastSeen: Date.now()
    }

    clients.set(subdomain, clientData)

    ws.on('message', message => {
        try {
            const response = JSON.parse(message)
            const { requestId, type } = response
            const pendingRequest = clientData.pendingRequests.get(requestId)

            if (!pendingRequest) return

            switch (type) {
                case 'full':
                    clearTimeout(pendingRequest.timeout)
                    const { headers, statusCode, body } = response
                    pendingRequest.res.writeHead(statusCode, headers)
                    pendingRequest.res.end(Buffer.from(body, 'base64'))
                    clientData.pendingRequests.delete(requestId)
                    break

                case 'data':
                    if (!pendingRequest.chunks) pendingRequest.chunks = []
                    pendingRequest.chunks[response.sequence] = Buffer.from(response.chunk, 'base64')
                    break

                case 'end':
                    clearTimeout(pendingRequest.timeout)
                    pendingRequest.res.writeHead(response.statusCode, response.headers)
                    for (let i = 0; i < response.sequence; i++) {
                        const chunk = pendingRequest.chunks[i]
                        if (chunk) pendingRequest.res.write(chunk)
                    }
                    pendingRequest.res.end()
                    clientData.pendingRequests.delete(requestId)
                    break

                case 'error':
                    clearTimeout(pendingRequest.timeout)
                    pendingRequest.res.status(response.statusCode).send(response.body)
                    clientData.pendingRequests.delete(requestId)
                    break
            }
        } catch (error) {
            console.error('Error processing response:', error)
        }
    })

    ws.on('close', () => {
        const clientData = clients.get(subdomain)
        if (clientData) {
            clientData.pendingRequests.forEach(pending => {
                pending.res.status(504).send('Tunnel disconnected')
            })
            clients.delete(subdomain)
        }
    })

    ws.on('error', error => {
        console.error('WebSocket error:', error)
    })

    ws.send(JSON.stringify({ type: 'connected', subdomain }))
})

app.use(express.json())
app.use(express.raw({ type: '*/*' }))

app.use((req, res) => {
    const subdomain = req.get('host').split('.')[0]
    const clientData = clients.get(subdomain)

    if (!clientData) {
        return res.status(404).send('Tunnel not found')
    }

    const requestId = nanoid(8)
    const timeout = setTimeout(() => {
        clientData.pendingRequests.delete(requestId)
        res.status(504).send('Gateway Timeout - No response received')
    }, 30000)

    clientData.pendingRequests.set(requestId, { res, timeout, chunks: [] })

    clientData.ws.send(JSON.stringify({
        type: 'request',
        requestId,
        method: req.method,
        path: req.url,
        headers: req.headers,
        body: req.body
    }))
})

server.listen(PORT, () => {
    console.log(`Tunnel server listening on port ${PORT}`)
})