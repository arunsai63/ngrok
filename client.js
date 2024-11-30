const axios = require('axios')
const WebSocket = require('ws')

const port = process.argv[2] || 3000
const subdomain = process.argv[3]

const wsUrl = subdomain ?
    `wss://connect.divinitydelights.com?subdomain=${subdomain}` :
    'wss://connect.divinitydelights.com'

const ws = new WebSocket(wsUrl)

ws.on('open', () => {
    console.log('attempting to connect to tunnel server')
})

ws.on('message', async message => {
    try {
        const request = JSON.parse(message)

        if (request.type === 'connected') {
            console.log(`Tunnel established at: https://${request.subdomain}.divinitydelights.com `)
            return
        }

        console.log(`Received request: ${request.method} ${request.path}`)

        try{
            const response = await axios({
                url: `http://localhost:${port}${request.path}`,
                method: request.method,
                headers: request.headers,
                data: request.body,
                validateStatus: () => true
            })

            ws.send(JSON.stringify({
                requestId: request.requestId,
                statusCode: response.status,
                headers: response.headers,
                body: response.data
            }))
        } catch (error) {
            ws.send(JSON.stringify({
                requestId: request.requestId,
                statusCode: 500,
                headers: {},
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



ws.on('error', error => console.error('WebSocket error:', error))