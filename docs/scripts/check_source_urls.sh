#!/usr/bin/env bash
# Fails on any absolute docs.aztec.network URL in the docs sources that production does not serve.
# Reads every literal http(s)://docs.aztec.network URL in git-tracked text under docs/ (pages,
# versioned snapshots, examples, scripts and code alike) and resolves its path offline through
# lib/docs_routes.sh: a docs page, a static file, a generated file or a netlify.toml redirect.
# Prints <file>:<line>: <url> per unresolved URL and exits 1 on any.
#
#   check_source_urls.sh
#   check_source_urls.sh --self-test
#
# Not read: the generated API references, the URL snapshots and yarn.lock. Not resolved: tag
# pages, /search and /aztec-nr-api/next/ (built only in previews). A URL finished at build or run
# time (a `${...}` template after the host, or a macro such as #release_version) is counted as
# deferred.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(dirname "$SCRIPT_DIR")"
# shellcheck source-path=SCRIPTDIR source=lib/docs_routes.sh
source "$SCRIPT_DIR/lib/docs_routes.sh"

# A URL ends at the first character that cannot appear in one unescaped, or that closes it in
# markdown, HTML, JSON, shell or a template literal.
url_re='https?://docs\.aztec\.network[^][:space:]"<>(){}|\`'"'"'\\]*'
ignored_re='^/((developers|operate)/tags(/|$)|search/?$|aztec-nr-api/next(/|$))'
# The version macros src/preprocess/include_version.js substitutes.
macro_re='#(release_(version|network|name|label)|include_(aztec|devnet|testnet|mainnet|foundation)_version(_without_prefix)?|include_version_without_prefix)([^A-Za-z0-9_]|$)'
excludes=(':(exclude)static/aztec-nr-api' ':(exclude)static/typescript-api' ':(exclude)snapshots' ':(exclude)yarn.lock')

# Prints ok, unresolved, deferred or ignored for one URL.
function classify {
  local url="$1" path
  if [[ "$url" == *'$' || "$url" =~ $macro_re ]]; then
    echo deferred
    return
  fi
  path="${url#*://docs.aztec.network}"
  path="${path#:443}"
  path="${path#:80}"
  path="${path%%[?#]*}"
  if [[ -n "$path" && "$path" != /* ]]; then
    echo ignored # another host that starts with this one
  elif [[ "${path:-/}" =~ $ignored_re ]]; then
    echo ignored
  elif resolves_url_path "${path:-/}"; then
    echo ok
  else
    echo unresolved
  fi
}

# Reads <file>:<line>:<url> matches on stdin; prints each unresolved one, then a summary line.
function scan {
  local matches url verdicts=""
  matches=$(sed -E 's/[.,;:!?*]+$//')
  if [[ -z "$matches" ]]; then
    echo "check_source_urls: no docs URLs found, so nothing was checked" >&2
    return 1
  fi
  while IFS= read -r url; do
    verdicts+="$(classify "$url") $url"$'\n'
  done < <(cut -d: -f3- <<<"$matches" | sort -u)
  awk '
    NR == FNR { sp = index($0, " "); verdict[substr($0, sp + 1)] = substr($0, 1, sp - 1); distinct++; next }
    {
      f = index($0, ":"); rest = substr($0, f + 1); l = index(rest, ":"); url = substr(rest, l + 1)
      count[verdict[url]]++
      if (verdict[url] == "unresolved") printf "%s:%s: %s\n", substr($0, 1, f - 1), substr(rest, 1, l - 1), url
    }
    END {
      printf "check_source_urls: %d docs URLs (%d distinct): %d resolve, %d deferred (template or macro), %d ignored, %d unresolved\n", \
        FNR, distinct, count["ok"], count["deferred"], count["ignored"], count["unresolved"]
      if (count["unresolved"]) {
        print "Fix each URL at its source, or add a netlify.toml redirect for a path that was published."
        exit 1
      }
    }' <(printf '%s' "$verdicts") - <<<"$matches"
}

function self_test {
  local tmp rc=0 h verdict url text want got
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN
  # Split so this script never matches its own fixtures.
  h='https://docs.aztec''.network'
  # shellcheck disable=SC2016 # literal template and shell text
  local fixtures=(
    "unresolved|$h/developers/docs/aztec-nr/self_test_missing_page|// Tests are out of scope for this tutorial. See $h/developers/docs/aztec-nr/self_test_missing_page for examples."
    "ok|$h/developers/docs/aztec-nr/testing_contracts|// See $h/developers/docs/aztec-nr/testing_contracts for examples."
    "ok|$h/developers/docs/aztec-nr/testing_contracts#running-tests|[Run tests]($h/developers/docs/aztec-nr/testing_contracts#running-tests)."
    "ok|$h/learn/what-is-aztec|Moved: [learn]($h/learn/what-is-aztec)."
    "ok|$h/developers/overview.md|Append .md (for example \`$h/developers/overview.md\`)."
    "unresolved|$h/developers/v5.2.0/overview.md|Cut versions have no twins: $h/developers/v5.2.0/overview.md"
    "ok|$h/developers/v5.2.0/overview|Archived: $h/developers/v5.2.0/overview"
    "ok|$h/img/brand/favicon.svg|<img src=\"$h/img/brand/favicon.svg\"/>"
    "ok|$h/aztec-nr-api/mainnet/noir_aztec/macros/fn.aztec|See $h/aztec-nr-api/mainnet/noir_aztec/macros/fn.aztec, then"
    "ok|$h/aztec-nr-api/mainnet/noir_aztec/|Index: $h/aztec-nr-api/mainnet/noir_aztec/"
    "ok|$h/sitemap.xml|Sitemap: $h/sitemap.xml"
    "ok|$h/aztec-nr-api/mainnet/llms.txt|- [Aztec.nr]($h/aztec-nr-api/mainnet/llms.txt): API index"
    "unresolved|$h/aztec-nr-api/testnet/llms.txt|- [Aztec.nr]($h/aztec-nr-api/testnet/llms.txt): API index"
    "ok|$h/networks|{\"docs\": \"$h/networks\", \"n\": 1}"
    "ok|$h/scripts/aztec-monitoring.sh|curl -fsSLO '$h/scripts/aztec-monitoring.sh' && URL=$h/llms-full.txt;"
    "ok|$h/llms-full.txt|"
    "ok|$h|Documentation: [docs]($h)"
    "deferred|$h\$|fullHref = \`$h"'${href}`;'
    "deferred|$h/developers/#release_version/overview|$h/developers/#release_version/overview"
    "ignored|$h/aztec-nr-api/next/noir_aztec/index.html|Preview only: $h/aztec-nr-api/next/noir_aztec/index.html"
    "ignored|$h/developers/tags/aztec-nr|$h/developers/tags/aztec-nr"
    "unresolved|$h/self_test_missing_page#release_notes|A fragment is not a macro: $h/self_test_missing_page#release_notes"
    "unresolved|$h:443/self_test_missing_page|Default port: $h:443/self_test_missing_page"
    "unresolved|$h/operate/../../docs/aztec_connect_sunset|Dot segments: $h/operate/../../docs/aztec_connect_sunset"
    "unresolved|$h/operate/operators/_node_hardware|Partials are not pages: $h/operate/operators/_node_hardware"
    "unresolved|$h/operate/operators/setup/running-a-node|The file name of a page with an id: $h/operate/operators/setup/running-a-node"
    "ok|$h/operate/operators/setup/running_a_node|Its id route: $h/operate/operators/setup/running_a_node"
    "ok|$h/developers/docs/aztec-nr.md|Index twin: $h/developers/docs/aztec-nr.md"
    "unresolved|$h/developers/docs/aztec-nr/index.md|Not a twin: $h/developers/docs/aztec-nr/index.md"
    "ok|$h/index.md|Root twin: $h/index.md"
    "unresolved|$h/developers/docs/foundational-topics/ethereum-aztec-messaging/portals.md|The id of an index file: $h/developers/docs/foundational-topics/ethereum-aztec-messaging/portals.md"
    "ok|$h/developers/docs/foundational-topics/ethereum-aztec-messaging.md|Its directory twin: $h/developers/docs/foundational-topics/ethereum-aztec-messaging.md"
    "unresolved|$h/developers/docs/tutorials/js_tutorials/webapp/03-network-and-wallet|A number-prefixed file name: $h/developers/docs/tutorials/js_tutorials/webapp/03-network-and-wallet"
    "ok|$h/developers/docs/tutorials/js_tutorials/webapp/network-and-wallet|Its route: $h/developers/docs/tutorials/js_tutorials/webapp/network-and-wallet"
    "unresolved|$h/operate/operators/keystore/examples|A draft: $h/operate/operators/keystore/examples"
  )
  local expected_urls="" expected_out=""
  local n=0
  for fixture in "${fixtures[@]}"; do
    IFS='|' read -r verdict url text <<<"$fixture"
    expected_urls+="$url"$'\n'
    if [[ -n "$text" ]]; then
      n=$((n + 1))
      printf '%s\n' "$text" >>"$tmp/fixture.md"
    fi
    [[ "$verdict" == unresolved ]] && expected_out+="fixture.md:$n: $url"$'\n'
    got=$(classify "$url")
    [[ "$got" == "$verdict" ]] || { echo "self-test: $url is $got, not $verdict" >&2; rc=1; }
  done

  local re
  re=$(from_to_regex "/self-test/:section/*")
  if ! [[ "/self-test/a/b/c" =~ $re ]] || [[ "/self-test/a" =~ $re ]]; then
    echo "self-test: from_to_regex mishandles a :name placeholder" >&2
    rc=1
  fi

  local matches st=0
  matches=$(cd "$tmp" && git grep --no-index -nIoE "$url_re" -- . | sed -E 's/[.,;:!?*]+$//')
  want=$(printf '%s' "$expected_urls")
  got=$(cut -d: -f3- <<<"$matches")
  [[ "$got" == "$want" ]] || { echo "self-test: extracted URLs differ:" >&2; diff <(echo "$want") <(echo "$got") >&2 || true; rc=1; }

  got=$(scan <<<"$matches") || st=$?
  [[ "$st" == 1 ]] || { echo "self-test: the scan exited $st, not 1" >&2; rc=1; }
  want=$(printf '%s' "$expected_out")
  [[ "$(grep -v '^check_source_urls: \|^Fix each' <<<"$got")" == "$want" ]] ||
    { echo "self-test: unresolved lines differ:" >&2; echo "$got" >&2; rc=1; }

  [[ "$rc" == 0 ]] && echo "check_source_urls self-test: ${#fixtures[@]} URLs from $n lines"
  return "$rc"
}

function main {
  local matches rc=0
  matches=$(git -C "$DOCS_ROOT" grep -nIoE "$url_re" -- . "${excludes[@]}") || rc=$?
  [[ "$rc" -le 1 ]] || { echo "check_source_urls: git grep exited $rc" >&2; return 2; }
  scan <<<"$matches"
}

docs_routes_init
case "${1:-}" in
  --self-test) self_test ;;
  "") main ;;
  *)
    echo "usage: $0 [--self-test]" >&2
    exit 2
    ;;
esac
