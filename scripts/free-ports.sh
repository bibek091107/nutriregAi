#!/usr/bin/env bash
# Free the NutriReg dev ports, reporting what was holding them.
#
# Port collisions are the most common local failure and the most confusing: the
# API dies with "address already in use" while the browser silently moves to
# port 3001, and the UI then reports a generic CORS error. This makes the
# conflict visible and, optionally, clears it.
#
#   ./scripts/free-ports.sh          # report only
#   ./scripts/free-ports.sh --kill   # stop whatever is listening
#
# Only processes matching NutriReg's own commands are killed, so an unrelated
# service on 3000 or 8000 is reported but never touched.

set -uo pipefail

PORTS=(3000 3001 8000)
KILL=0
[[ "${1:-}" == "--kill" ]] && KILL=1

found=0
for port in "${PORTS[@]}"; do
  pids=$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u)
  [[ -z "$pids" ]] && continue
  found=1
  for pid in $pids; do
    cmd=$(ps -o command= -p "$pid" 2>/dev/null || echo "?")
    case "$cmd" in
      *uvicorn*app.api.main*|*next*dev*|*next-server*)
        echo "port $port  pid $pid  $cmd"
        if [[ $KILL -eq 1 ]]; then
          kill "$pid" 2>/dev/null && echo "         -> stopped"
        else
          echo "         -> NutriReg process; stop it with: kill $pid"
        fi
        ;;
      *)
        echo "port $port  pid $pid  $cmd"
        echo "         -> NOT a NutriReg process; left alone"
        ;;
    esac
  done
done

if [[ $found -eq 0 ]]; then
  echo "Ports ${PORTS[*]} are all free."
else
  echo
  if [[ $KILL -eq 0 ]]; then
    echo "Re-run with --kill to stop the NutriReg processes listed above."
  fi
fi
