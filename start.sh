#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
PORT="${PORT:-3000}"
export PORT

run_timed() {
  /usr/bin/time -p "$@"
}

if [[ -f package.json ]]; then
  if [[ ! -d node_modules ]]; then
    if [[ -f package-lock.json ]]; then
      run_timed npm ci --no-audit --no-fund
    else
      run_timed npm install --no-audit --no-fund
    fi
  fi

  if run_timed node -e "const p=require('./package.json'); process.exit(p.scripts?.build ? 0 : 1)"; then
    output_dir="${BUILD_DIR:-dist}"
    needs_build=false
    [[ -f "$output_dir/index.html" ]] || needs_build=true
    if [[ "$needs_build" == false ]] && find . -path './node_modules' -prune -o -path "./$output_dir" -prune -o -type f -newer "$output_dir/index.html" -print -quit | grep -q .; then
      needs_build=true
    fi
    if [[ "$needs_build" == true ]]; then
      run_timed npm run build
    fi
    [[ -f "$output_dir/index.html" ]] || { echo "Build did not create $output_dir/index.html" >&2; exit 1; }
    STATIC_DIR="$PROJECT_DIR/$output_dir"
  elif [[ -f index.html ]]; then
    STATIC_DIR="$PROJECT_DIR"
  else
    echo 'package.json has no build script and no root index.html.' >&2
    exit 1
  fi
elif [[ -f index.html ]]; then
  STATIC_DIR="$PROJECT_DIR"
elif [[ -f dist/index.html ]]; then
  STATIC_DIR="$PROJECT_DIR/dist"
else
  echo 'No app source found: expected index.html, dist/index.html, or a package.json with a build script.' >&2
  exit 1
fi

STATIC_DIR="$(cd "$STATIC_DIR" && pwd)"
case "$STATIC_DIR" in
  "$PROJECT_DIR"|"$PROJECT_DIR"/*) ;;
  *) echo "Static output must be inside $PROJECT_DIR" >&2; exit 1 ;;
esac

WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
run_timed mkdir -p "$WEB_DIR"
WEB_DIR="$WEB_DIR" PROJECT="$PROJECT_DIR" STATIC="$STATIC_DIR" run_timed node -e 'const fs=require("node:fs"); const path=require("node:path"); fs.writeFileSync(path.join(process.env.WEB_DIR,"deployment-output.json"), JSON.stringify({project:process.env.PROJECT,directory:process.env.STATIC},null,2)+"\n")'

run_timed node - "$STATIC_DIR" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const root = path.resolve(process.argv[2])
const port = Number(process.env.PORT || 3000)
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' }
http.createServer((req, res) => {
  let requested
  try { requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname) } catch { res.writeHead(400).end('Bad request'); return }
  let file = path.resolve(root, `.${requested}`)
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end('Forbidden'); return }
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
  } catch { file = path.join(root, 'index.html') }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404).end('Not found'); return }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' })
    res.end(content)
  })
}).listen(port, '0.0.0.0', () => console.log(`Serving ${root} on port ${port}`))
NODE
