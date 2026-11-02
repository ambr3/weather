#!/usr/bin/env bash
# Seclusa Weather — run this app's own tests.
#
# The app is its own repository, so its tests run here rather than in the
# website's suite. Nothing is installed and nothing touches the network.
set -euo pipefail
cd "$(dirname "$0")"

# Prefer the shared ambr3-dev toolchain (nvm node) when the shell has none.
if ! command -v node >/dev/null 2>&1; then
  _tools_env="$(cd ../.. && pwd)/tools/env.sh"
  if [ -f "$_tools_env" ]; then
    # shellcheck source=/dev/null
    source "$_tools_env"
  fi
  unset _tools_env
fi

echo "→ weather tests @ $PWD"

bash scripts/smoke.sh

# The service worker has to keep its precache list in step with the files
# that are actually shipped, or the app installs and then goes blank offline.
missing=0
# Entries are quoted with ', " or ` (the versioned ones are template literals).
assets=$(grep -oE "[\`'\"][.]/[^\`'\"]+[\`'\"]" sw.js | tr -d "\`'\"" | sed 's|^\./||; s|?.*$||' | sort -u || true)
[ -n "$assets" ] || { echo "FAIL: no precache entries found in sw.js"; exit 1; }
while read -r asset; do
  if [ ! -f "$asset" ]; then
    echo "FAIL: sw.js precaches $asset, which does not exist"
    missing=1
  fi
done <<< "$assets"

if [ "$missing" -eq 0 ]; then
  echo "PASS: every precached file exists"
else
  echo "FAIL: the precache list names files that are not there"
  exit 1
fi

echo "→ weather tests passed"
