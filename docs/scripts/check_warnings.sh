#!/usr/bin/env bash
# Prints every warning-like line in the given docs build/test logs as <log>:<line>: <text> and
# exits 1 if there is any; empty output means the logs are clean. There is no allowlist: a hit is
# fixed at its cause. ANSI colour codes and OSC-8 hyperlinks are stripped first: a code abutting
# "warn" defeats the word boundary, and yarn's links repeat the error code inside their URL.
#
#   check_warnings.sh <log>...
#   check_warnings.sh --self-test
set -euo pipefail

pattern='\bwarn(ings?)?\b|deprecat|\[error\]|diagnostic|\bYN0(002|009|028|060|061|072|086)\b|failed with errors|(^|[[:space:]])\(!\) |browserslist|caniuse-lite|update available|issues found: [1-9]|broken (anchor|link)s?(: *[1-9]|[^s:]|$)'

function scan {
  local hits=0 log clean matches rc line
  for log in "$@"; do
    if ! { [ -f "$log" ] && [ -r "$log" ] &&
      clean=$(sed -E $'s/\x1b\\][^\x1b\x07]*(\x1b\\\\|\x07)//g; s/\x1b\\[[0-9;?]*[A-Za-z]//g' "$log"); }; then
      echo "check_warnings: cannot read $log" >&2
      return 2
    fi
    rc=0
    matches=$(grep -n -i -E "$pattern" <<<"$clean") || rc=$?
    [ "$rc" -le 1 ] || { echo "check_warnings: grep failed on $log" >&2; return 2; }
    [ "$rc" = 1 ] && continue
    while IFS= read -r line; do printf '%s:%s\n' "$log" "$line"; done <<<"$matches"
    hits=1
  done
  return "$hits"
}

function self_test {
  local tmp rc=0
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN
  # shellcheck disable=SC2016 # literal log lines, backticks included
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
    '  - Broken links: 10'
    'Broken anchor on source page path = /developers/x:'
    $'runner\t\xe2\x9e\xa4 \x1b]8;;https://yarnpkg.com/advanced/error-codes#yn0028---frozen_lockfile_exception\x1b\\YN0028\x1b]8;;\x1b\\: The lockfile would have been modified by this install.'
    'runner	➤ YN0000: · Failed with errors in 0s 46ms'
    '(!) Some chunks are larger than 500 kB after minification. Consider:'
    $'runner\t(!) Some chunks are larger than 500 kB after minification.'
  )
  local negatives=(
    'CSpell: Files checked: 412, Issues found: 0 in 0 files.'
    '  - Broken links: 0'
    '[SUCCESS] Generated static files in "build".'
    '➤ YN0000: · Done in 1m 31s'
    '✔ resolveSnippetSource (9.4ms)'
    'We were forewarned about the ceremony.'
    $'\x1b]8;;https://yarnpkg.com/advanced/error-codes#yn0060---incompatible_peer_dependency\x1b\\docs\x1b]8;;\x1b\\: Done in 2s'
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
  local st=0
  scan "$tmp" >/dev/null 2>&1 || st=$?
  [ "$st" = 2 ] || { echo "self-test: a directory argument returned $st, not 2" >&2; rc=1; }
  [ "$rc" = 0 ] && echo "check_warnings self-test: ${#positives[@]} hits, ${#negatives[@]} clean"
  return "$rc"
}

case ${1:-} in
  --self-test) self_test ;;
  ''|-*) sed -n '2,/^set -e/p' "$0" | sed '$d; s/^# \{0,1\}//' >&2; exit 2 ;;
  *) scan "$@" ;;
esac
