#!/usr/bin/env bash
# Runs one command while holding the repo's build lock.
#
# Several agents share this checkout, and `cargo check`/`cargo test` on this
# workspace is memory-hungry enough that two concurrent runs can exhaust the
# machine — that has already killed a session once. Serialising builds is far
# cheaper than recovering from an out-of-memory kill.
#
# The lock is a directory, because `mkdir` is atomic on every filesystem we care
# about and needs no dependencies. The waiting side polls rather than using
# `flock`, which macOS does not ship.
#
# Usage:
#   scripts/locked-build.sh cargo check -p react-native-gpui --manifest-path ...
#   scripts/locked-build.sh --timeout 1800 cargo test ...
#
# Set BUILD_LOCK_TIMEOUT to change the default wait (seconds, 0 = forever), and
# BUILD_LOCK_STALE_AFTER to change how long a lock with no pid file is trusted
# (seconds, default 120).
#
# Only wrap commands that compile. Unit tests that do not build anything, and
# formatters, do not need the lock and would only serialise for no reason.

set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
lock="$root/.local/build.lock"
timeout="${BUILD_LOCK_TIMEOUT:-3600}"

while [ "${1:-}" = "--timeout" ]; do
  timeout="$2"
  shift 2
done

if [ "$#" -eq 0 ]; then
  echo "locked-build: nothing to run" >&2
  exit 2
fi

# Seconds since the lock directory was last modified, or 0 if it cannot be read.
# macOS and GNU stat disagree on the flag, so both are tried.
lock_age() {
  local path=$1 modified now
  modified=$(stat -f %m "$path" 2>/dev/null || stat -c %Y "$path" 2>/dev/null || echo 0)
  now=$(date +%s)
  if [ "$modified" -gt 0 ] 2>/dev/null; then
    echo $((now - modified))
  else
    echo 0
  fi
}

started=$(date +%s)
waited=0

while ! mkdir "$lock" 2>/dev/null; do
  # A lock left behind by a killed process would block every later build, so a
  # stale one is reclaimed. The owner writes its pid, and a pid that is gone
  # means the lock is dead.
  if [ -f "$lock/pid" ]; then
    holder=$(cat "$lock/pid" 2>/dev/null || echo "")
    if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
      echo "locked-build: reclaiming stale lock from pid $holder" >&2
      rm -rf "$lock"
      continue
    fi
  else
    # No pid file: the owner either died between `mkdir` and writing it, or is
    # a version of this script that predates the file. Reclaim only once the
    # directory is old enough that no honest owner could still be starting up,
    # so a lock is never yanked from under a build that is really running.
    age=$(lock_age "$lock")
    if [ "$age" -ge "${BUILD_LOCK_STALE_AFTER:-120}" ]; then
      echo "locked-build: reclaiming pid-less lock from ${age}s ago" >&2
      rm -rf "$lock"
      continue
    fi
  fi
  now=$(date +%s)
  waited=$((now - started))
  if [ "$timeout" -gt 0 ] && [ "$waited" -ge "$timeout" ]; then
    echo "locked-build: timed out after ${waited}s waiting for $lock" >&2
    echo "locked-build: if no build is running, remove that directory" >&2
    exit 1
  fi
  if [ $((waited % 15)) -eq 0 ]; then
    echo "locked-build: waiting for another build (${waited}s)" >&2
  fi
  sleep 5
done

echo "$$" > "$lock/pid"
cleanup() {
  rm -rf "$lock"
}
trap cleanup EXIT INT TERM

"$@"
