const axios = require('axios')
const WebSocket = require('ws')

const CHUNK_SIZE = 512 * 1024 // 512KB chunks

function parseArgs() {
    const args = process.argv.slice(2)
    const parsed = {}

    for (let i = 0; i < args.length; i += 2) {
        switch (args[i]) {
            case '-p':
                parsed.port = args[i + 1]
                break
            case '-d':
                parsed.subdomain = args[i + 1]
                break
        }
    }

    if (!parsed.port) {
        console.error('Port (-p) is required')
        process.exit(1)
    }

    return parsed
}

function createTunnel() {
    const { port, subdomain } = parseArgs()
    const baseUrl = 'wss://connect.divinitydelights.com'
    const wsUrl = subdomain ? `${baseUrl}?subdomain=${subdomain}` : baseUrl

    const ws = new WebSocket(wsUrl)

    ws.on('open', () => {
        console.log('attempting to connect to tunnel server')
    })

    ws.on('message', async message => {
        try {
            const request = JSON.parse(message)

            if (request.type === 'connected') {
                console.log(`Tunnel established at: https://${request.subdomain}.divinitydelights.com`)
                return
            }

            if (request.type === 'error') {
                console.error(`Error from tunnel server: ${request.message}`)
                return
            }

            console.log(`Received request: ${request.method} ${request.path}`)

            try {
                const response = await axios({
                    url: `http://localhost:${port}${request.path}`,
                    method: request.method,
                    headers: request.headers,
                    data: request.body,
                    responseType: 'stream',
                    validateStatus: () => true
                })

                let sequence = 0
                let buffer = Buffer.alloc(0)
                let is_data_chunked = false

                response.data.on('data', chunk => {
                    buffer = Buffer.concat([buffer, chunk])

                    while (buffer.length >= CHUNK_SIZE) {
                        is_data_chunked = true
                        const chunkToSend = buffer.slice(0, CHUNK_SIZE)
                        buffer = buffer.slice(CHUNK_SIZE)

                        ws.send(JSON.stringify({
                            requestId: request.requestId,
                            type: 'data',
                            sequence: sequence++,
                            chunk: chunkToSend.toString('base64')
                        }))
                    }
                })

                response.data.on('end', () => {
                    if (!is_data_chunked) {
                        ws.send(JSON.stringify({
                            requestId: request.requestId,
                            type: 'full',
                            statusCode: response.status,
                            headers: response.headers,
                            body: buffer.toString('base64')
                        }))
                        return
                    }

                    if (buffer.length > 0) {
                        ws.send(JSON.stringify({
                            requestId: request.requestId,
                            type: 'data',
                            sequence: sequence++,
                            chunk: buffer.toString('base64')
                        }))
                    }

                    ws.send(JSON.stringify({
                        requestId: request.requestId,
                        type: 'end',
                        sequence: sequence,
                        statusCode: response.status,
                        headers: response.headers
                    }))
                })

                response.data.on('error', error => {
                    ws.send(JSON.stringify({
                        requestId: request.requestId,
                        type: 'error',
                        statusCode: 500,
                        body: error.message
                    }))
                })

            } catch (error) {
                ws.send(JSON.stringify({
                    requestId: request.requestId,
                    type: 'error',
                    statusCode: 500,
                    body: error.message
                }))
            }
        } catch (error) {
            console.error('Error handling request:', error)
        }
    })

    ws.on('close', () => {
        console.log('Disconnected from tunnel server')
        process.exit()
    })

    ws.on('error', error => {
        console.error('WebSocket error:', error)
    })
}

createTunnel()