#!/usr/bin/env node
// Serves the static build (out/) the way Netlify does, for local checks and
// browser tests: exact files, /page -> page.html, the redirects from
// netlify.toml (only when no file matches), and 404.html for the rest.
//
//   npm run build && npm run preview        # http://localhost:3100

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "out");
const port = Number(process.env.PORT ?? process.argv[2] ?? 3100);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// [[redirects]] blocks from netlify.toml: from, to, status.
const redirects = [...readFileSync("netlify.toml", "utf8").matchAll(/\[\[redirects\]\]\s+from = "([^"]+)"\s+to = "([^"]+)"\s+status = (\d+)/g)].map(
  ([, from, to, status]) => ({ from, to, status: Number(status) }),
);

function matchRedirect(path) {
  for (const r of redirects) {
    const names = [];
    const re = new RegExp(`^${r.from.replace(/:[a-z]+/g, (m) => (names.push(m), "([^/]+)"))}/?$`);
    const m = path.match(re);
    if (m) return { status: r.status, to: names.reduce((to, n, i) => to.replace(n, m[i + 1]), r.to) };
  }
  return null;
}

async function file(path) {
  try {
    return (await stat(path)).isFile() ? path : null;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, "");
  const clean = safe.replace(/\/+$/, "");
  const found =
    (await file(join(root, safe))) ?? (await file(join(root, `${clean}.html`))) ?? (await file(join(root, clean, "index.html")));
  if (found) {
    const immutable = path.startsWith("/_next/static/");
    res.writeHead(200, {
      "content-type": TYPES[extname(found)] ?? "application/octet-stream",
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
    });
    return res.end(await readFile(found));
  }
  const redirect = matchRedirect(path);
  if (redirect) {
    res.writeHead(redirect.status, { location: redirect.to });
    return res.end();
  }
  res.writeHead(404, { "content-type": TYPES[".html"] });
  res.end(await readFile(join(root, "404.html")).catch(() => "Not found"));
}).listen(port, () => console.log(`NUMU OS static build on http://localhost:${port}`));
