// Serves the static export the way GitHub Pages does: under a base path,
// with trailing-slash directories mapped to index.html.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const [, , root = "out", base = "/hr-it", port = "3100"] = process.argv;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".png": "image/png",
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!path.startsWith(base)) {
    res.writeHead(404).end("not found");
    return;
  }
  let file = normalize(join(root, path.slice(base.length)));
  if (!file.startsWith(normalize(root))) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) file = join(root, "404.html");
  res.writeHead(file.endsWith("404.html") && !path.endsWith("404.html") ? 404 : 200, {
    "Content-Type": types[extname(file)] ?? "application/octet-stream",
  });
  createReadStream(file).pipe(res);
}).listen(Number(port), () => console.log(`static export on http://localhost:${port}${base}/`));
