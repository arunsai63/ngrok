const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const { randomUUID } = require('crypto')

const nanoid = (size) => randomUUID().replace(/-/g, '').slice(0, size)

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

const clients = new Map()

PORT = process.env.PORT || 8005

wss.on('connection', (ws, req) => {
    const queryParams = new URL(req.url, 'http://localhost').searchParams
    let subdomain = queryParams.get('subdomain') || nanoid(8)

    const clientData = {
        ws,
        pendingRequests: new Map(),
        lastSeen: Date.now()
    }

    clients.set(subdomain, clientData)

    ws.on('message', message => {
        try {
            const response = JSON.parse(message)
            // if (response.type === 'ping') {
            //     clients.get(response.subdomain).lastSeen = Date.now()
            //     return
            // }
            const { requestId } = response
            const pendingRequest = clientData.pendingRequests.get(requestId)

            if (pendingRequest) {
                clearTimeout(pendingRequest.timeout)
                const { headers, body, statusCode } = response
                pendingRequest.res.writeHead(statusCode, headers)
                pendingRequest.res.end(body)
                clientData.pendingRequests.delete(requestId)
            }
        } catch (error) {
            console.error('Error processing response:', error)
        }
    })

    ws.on('close', () => {
        const clientData = clients.get(subdomain)
        if (clientData) {
            // Respond to all pending requests with an error
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
    clientData.pendingRequests.set(requestId, { res })

    const timeout = setTimeout(() => {
        clientData.pendingRequests.delete(requestId)
        res.status(504).send('Gateway Timeout - No response received')
    }, 30000)

    clientData.pendingRequests.set(requestId, { res, timeout })

    clientData.ws.send(JSON.stringify({
        type: 'request',
        requestId,
        method: req.method,
        path: req.url,
        headers: req.headers,
        body: req.body
    }))
})

// Cleanup disconnected clients every hour
// setInterval(() => {
//     const now = Date.now()
//     clients.forEach((clientData, subdomain) => {
//         if ((now - clientData.lastSeen) > 60 * 60 * 1000) {
//             clients.delete(subdomain)
//         }
//     })
// }, 60 * 60 * 1000) // 1 hour

server.listen(PORT, () => {
    console.log(`Tunnel server listening on port ${PORT}`)
})