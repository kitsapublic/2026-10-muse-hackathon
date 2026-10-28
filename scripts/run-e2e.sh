#!/bin/sh
# The browser reference flow and the generated client against a fresh local service.
#
#   ELIGIBILITY_LAB_SERVICE    the eligibility-lab-service command of an environment with kitsa-eligibility-lab[service]
#   ELIGIBILITY_LAB_REFERENCE  the public bundle folder, or a reference root holding demonstration/ and optional evaluation/
#   ELIGIBILITY_LAB_PORT       loopback port (default 8765)
#
# A fresh temporary store serves the public bundle. An optional evaluation sibling is installed private
# for internal boundary checks. Public submission checks need only the demonstration bundle.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
service=${ELIGIBILITY_LAB_SERVICE:?set ELIGIBILITY_LAB_SERVICE}
reference=${ELIGIBILITY_LAB_REFERENCE:?set ELIGIBILITY_LAB_REFERENCE}
port=${ELIGIBILITY_LAB_PORT:-8765}
work=$(cd "$(mktemp -d)" && pwd -P)
store="$work/store"
cleanup() {
  result=$?
  trap - EXIT
  if [ -n "${pid:-}" ]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  chmod -R u+w "$work" && rm -rf "$work"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cd "$here"
"$service" init --store "$store" >/dev/null
if [ -f "$reference/manifest.json" ]; then
  demonstration="$reference"
else
  demonstration="$reference/demonstration"
fi
"$service" install-bundle --store "$store" --bundle "$demonstration" --audience public >/dev/null
if [ -f "$reference/evaluation/manifest.json" ]; then
  "$service" install-bundle --store "$store" --bundle "$reference/evaluation" --audience private >/dev/null
fi
npm run build -w @kitsa/eligibility-lab-showcase --silent >/dev/null
"$service" serve --store "$store" --port "$port" --assets "$here/apps/showcase/dist" >"$work/service.log" 2>&1 &
pid=$!
tries=0
until curl -fsS "http://127.0.0.1:$port/v1/session" >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -gt 100 ] && { cat "$work/service.log"; exit 1; }
  sleep 0.2
done
ELIGIBILITY_LAB_URL="http://127.0.0.1:$port" npm run e2e --silent
ELIGIBILITY_LAB_URL="http://127.0.0.1:$port" npx vitest run --root packages/eligibility-client \
  src/service.integration.test.ts
