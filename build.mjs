import * as esbuild from "esbuild";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

await esbuild.build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  minify: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: "dist/bundle.js",
  logLevel: "warning",
});

execSync("npx tailwindcss -i src/tailwind.css -o dist/tailwind.css --minify", { stdio: "inherit" });

const js = readFileSync("dist/bundle.js", "utf8");
const css = readFileSync("dist/tailwind.css", "utf8");

const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Finance Command Center</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body style="background:#000">
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;
writeFileSync("index.html", html);
console.log("built index.html:", (html.length / 1024).toFixed(0), "KB");
