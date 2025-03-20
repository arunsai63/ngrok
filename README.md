# TunnelLite

**TunnelLite** is a bare-bones, open-source alternative to ngrok, designed to expose your local development server to the internet with minimal setup. It leverages WebSocket connections and chunk-based API responses for fast, efficient tunneling. Perfect for developers who want a lightweight solution to share localhost publicly.

## Features
- Simple setup with Nginx and Let’s Encrypt for SSL.
- WebSocket-based tunneling for real-time communication.
- Chunk-based API responses for improved performance.
- Expose your localhost to the world in minutes.

## How It Works
TunnelLite creates a WebSocket connection between your local machine (via `client.js`) and a public server (via `server.js`). Here’s the flow:
1. A request hits your public server (e.g., `custom.tunnellite.com`) on port 443.
2. The server forwards the request via WebSocket to your local `client.js`.
3. `client.js` makes an API call to your localhost (e.g., `http://localhost:3000`).
4. The response is sent back through the WebSocket to the server.
5. The server delivers the response to the original requester.

Chunk-based responses ensure that data is streamed efficiently, reducing latency compared to traditional buffering methods.

## Prerequisites
- [Node.js](https://nodejs.org/) installed on your local machine and server.
- [Nginx](https://nginx.org/) installed on your server.
- A domain name pointing to your server’s IP address.
- Basic familiarity with terminal commands.

## Setup Instructions

### Server Setup
1. **Install Nginx**
   - On your server, install Nginx:
     ```bash
     sudo apt update
     sudo apt install nginx
     ```
   - Start Nginx:
     ```bash
     sudo systemctl start nginx
     ```

2. **Obtain an SSL Certificate with Let’s Encrypt**
   - Install Certbot:
     ```bash
     sudo apt install certbot python3-certbot-nginx
     ```
   - Run Certbot to get an SSL certificate for your domain:
     ```bash
     sudo certbot --nginx -d custom.tunnellite.com
     ```
   - Follow the prompts to configure SSL.

3. **Configure Nginx**
   - Edit your Nginx configuration file (e.g., `/etc/nginx/sites-available/tunnellite`):
     ```nginx
     server {
         listen 443 ssl;
         server_name custom.tunnellite.com;

         ssl_certificate /etc/letsencrypt/live/custom.tunnellite.com/fullchain.pem;
         ssl_certificate_key /etc/letsencrypt/live/custom.tunnellite.com/privkey.pem;

         location / {
             proxy_pass http://localhost:8005;
             proxy_http_version 1.1;
             proxy_set_header Upgrade $http_upgrade;
             proxy_set_header Connection "upgrade";
             proxy_set_header Host $host;
         }
     }
     ```
   - Enable the configuration:
     ```bash
     sudo ln -s /etc/nginx/sites-available/tunnellite /etc/nginx/sites-enabled/
     ```
   - Test and reload Nginx:
     ```bash
     sudo nginx -t
     sudo systemctl reload nginx
     ```

4. **Run the Server**
   - Clone this repository to your server:
     ```bash
     git clone https://github.com/arunsai63/tunnellite.git
     cd tunnellite
     ```
   - Install dependencies:
     ```bash
     npm install
     ```
   - Start `server.js` on port 8005:
     ```bash
     node server.js
     ```

### Client Setup
1. **Run the Client on Your Local Machine**
   - Clone this repository locally (or copy the client files):
     ```bash
     git clone https://github.com/arunsai63/tunnellite.git
     cd tunnellite
     ```
   - Install dependencies:
     ```bash
     npm install
     ```
   - Start `client.js`, ensuring it connects to your server:
     ```bash
     node client.js
     ```
   - By default, `client.js` proxies requests to `http://localhost:3000`. Modify the script if your local server runs on a different port.

2. **Test It**
   - Open a browser and visit `https://custom.tunnellite.com`.
   - If your local server is running (e.g., a simple Node.js app on port 3000), you should see the response from your localhost!

## Example Usage
- Local server: A Node.js app running on `http://localhost:3000`.
- Public URL: `https://custom.tunnellite.com`.
- Request a page (e.g., `/api/data`), and TunnelLite will relay it from your localhost to the public internet.

## Performance
TunnelLite uses **chunk-based API responses**, streaming data in smaller packets rather than waiting for the full response. This reduces latency and makes it ideal for real-time applications or large payloads.

## Contributing
Contributions are welcome! Feel free to:
- Open an issue for bugs or feature requests.
- Submit a pull request with improvements.
- Star this repo if you find it useful!

## License
This project is licensed under the [MIT License](LICENSE).

## Acknowledgments
- Inspired by the simplicity and power of ngrok.
- Built with love by [arunsai63].

