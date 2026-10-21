#!/usr/bin/env bash
# Prints every warning-like line in the given docs build/test logs as <log>:<line>: <text> and
# exits 1 if there is any; empty output means the logs are clean. There is no allowlist: a hit is
# fixed at its cause. ANSI colour codes are stripped first, since a code abutting "warn" defeats
# the word boundary.
#
#   labs_docs_warnings.sh <log>...
#   labs_docs_warnings.sh --self-test
set -euo pipefail

pattern='\bwarn(ings?)?\b|deprecat|\[error\]|diagnostic|\bYN0(002|009|060|061|086)\b|browserslist|caniuse-lite|update available|issues found: [1-9]|broken (anchor|link)'

function scan {
  local hits=0 log
  for log in "$@"; do
    [ -r "$log" ] || { echo "labs_docs_warnings: cannot read $log" >&2; return 2; }
    if sed -E $'s/\x1b\\[[0-9;?]*[A-Za-z]//g' "$log" | grep -n -i -E "$pattern" | sed "s|^|$log:|"; then
      hits=1
    fi
  done
  return "$hits"
}

function self_test {
  local tmp rc=0
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN
  local positives=(
    '[WARN] Failed to generate TypeDoc for package stdlib'
    'Warning: React version not specified in eslint-plugin-react settings.'
    '(node:1) DeprecationWarning: The `punycode` module is deprecated.'
    '➤ YN0061: │ glob@npm:7.2.3 is deprecated: Glob versions prior to v9 are no longer supported'
    '[WARNING] Docusaurus found broken anchors!'
    $'\x1b[33mwarn\x1b[39m The babel.config.js file is ignored.'
    'Browserslist: browsers data (caniuse-lite) is 7 months old.'
    '[ERROR] Unable to build website for locale en.'
    'CSpell: Files checked: 412, Issues found: 3 in 2 files.'
    '➤ YN0002: │ docs@workspace:. doesn'"'"'t provide react-dom (p1a2b3), requested by @x/y.'
    'Minifier: 2 diagnostics in docs/aztec-nr.html'
    'npm warn exec 2 packages are looking for funding'
  )
  local negatives=(
    'CSpell: Files checked: 412, Issues found: 0 in 0 files.'
    '[SUCCESS] Generated static files in "build".'
    '➤ YN0000: · Done in 1m 31s'
    '✔ resolveSnippetSource (9.4ms)'
    'We were forewarned about the ceremony.'
  )
  local line
  for line in "${positives[@]}"; do
    printf '%s\n' "$line" >"$tmp/log"
    if scan "$tmp/log" >/dev/null; then echo "self-test: missed: $line" >&2; rc=1; fi
  done
  for line in "${negatives[@]}"; do
    printf '%s\n' "$line" >"$tmp/log"
    if ! scan "$tmp/log" >/dev/null; then echo "self-test: false hit: $line" >&2; rc=1; fi
  done
  [ "$rc" = 0 ] && echo "labs_docs_warnings self-test: ${#positives[@]} hits, ${#negatives[@]} clean"
  return "$rc"
}

case ${1:-} in
  --self-test) self_test ;;
  ''|-*) sed -n '2,/^set -e/p' "$0" | sed '$d; s/^# \{0,1\}//' >&2; exit 2 ;;
  *) scan "$@" ;;
esac
