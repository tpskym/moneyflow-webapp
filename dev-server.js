const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 4173;
const ROOT = process.cwd();
const HOST = "127.0.0.1";
const WATCHED = ["index.html", "app.js", "styles.css", "manifest.webmanifest", "sw.js"];
const clients = new Set();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(res, code, headers, data) {
  res.writeHead(code, headers);
  res.end(data);
}

function safeContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function serveFile(req, res) {
  const incoming = decodeURIComponent(req.url.split("?")[0] || "/");
  const normalized = incoming === "/" ? "/index.html" : incoming;
  const absolute = path.join(ROOT, path.normalize(normalized));

  if (!absolute.startsWith(ROOT)) {
    send(res, 403, { "Content-Type": "text/plain; charset=utf-8" }, "Forbidden");
    return;
  }

  fs.readFile(absolute, (error, content) => {
    if (!error) {
      send(res, 200, { "Content-Type": safeContentType(absolute), "Cache-Control": "no-cache" }, content);
      return;
    }

    if (error.code === "ENOENT") {
      const fallback = path.join(ROOT, "index.html");
      fs.readFile(fallback, (fallbackError, fallbackContent) => {
        if (fallbackError) {
          send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not Found");
          return;
        }
        send(res, 200, { "Content-Type": safeContentType(fallback), "Cache-Control": "no-cache" }, fallbackContent);
      });
      return;
    }

    send(res, 500, { "Content-Type": "text/plain; charset=utf-8" }, `Server error: ${error.message}`);
  });
}

function pushReload(reason) {
  const payload = JSON.stringify({ reason });
  for (const client of clients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      clients.delete(client);
    }
  }
}

function addWatchers() {
  for (const file of WATCHED) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    fs.watch(full, { persistent: true }, () => {
      pushReload(file);
    });
  }
}

function main() {
  addWatchers();

  const server = http.createServer((req, res) => {
    if (req.url === "/__reload") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("retry: 1000\n");
      res.write("event: connected\ndata: {\"ok\":true}\n\n");

      clients.add(res);
      req.on("close", () => {
        clients.delete(res);
      });
      return;
    }

    serveFile(req, res);
  });

  server.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`MoneyFlow dev server: http://${HOST}:${PORT}`);
    console.log("Live reload: enabled");
  });
}

main();
