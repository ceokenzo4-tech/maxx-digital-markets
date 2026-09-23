#!/bin/bash
cd "$(dirname "$0")" || exit 1
if [ -f data/maxx.pid ]; then
  PID=$(cat data/maxx.pid)
  kill "$PID" 2>/dev/null || true
  rm -f data/maxx.pid
fi
echo "MAXX stopped."
