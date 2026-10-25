import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8443;
const HTTP_PORT = process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT, 10) : 8080;

const MIME_TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".js": "application/javascript; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function handler(req, res) {
  let reqPath = req.url.split("?")[0];
  if (reqPath === "/") reqPath = "/index.html";

  const safePath = path.normalize(path.join(__dirname, reqPath));
  if (!safePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=UTF-8" });
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN"
    });

    const stream = fs.createReadStream(safePath);
    stream.pipe(res);
  });
}

// Start HTTP server
http.createServer(handler).listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`HTTP server running at http://0.0.0.0:${HTTP_PORT}`);
});

// Start HTTPS server
try {
  const options = {
    key: fs.readFileSync(path.join(__dirname, "certs/server.key")),
    cert: fs.readFileSync(path.join(__dirname, "certs/server.crt"))
  };
  https.createServer(options, handler).listen(PORT, "0.0.0.0", () => {
    console.log(`Secure HTTPS server running at https://0.0.0.0:${PORT}`);
    console.log(`Corporate LAN access: https://192.168.68.50:${PORT}`);
  });
} catch (err) {
  console.warn("HTTPS server could not start:", err.message);
}
