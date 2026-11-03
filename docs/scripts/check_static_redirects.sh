#!/usr/bin/env bash
# Fails when a file under static/ that production published is gone and no netlify.toml redirect
# matches its old URL the way Netlify does: against the percent-encoded request path, byte for byte
# (lib/docs_routes.sh). A redirect written with a literal space never matches.
#
# The published set is snapshots/published-static.txt, an append-only inventory: CI clones a single
# commit, so no history says what a change removed. A file added since the last release counts as
# not listed yet and never fails the check; scripts/refresh_url_snapshot.sh lists it at the next
# release. The generated API references (static/aztec-nr-api, static/typescript-api) are out of scope.
#
#   check_static_redirects.sh              prints static/<file>: <old URL> per unredirected removal
#   check_static_redirects.sh --update     appends the served files the inventory lacks; never removes
#   check_static_redirects.sh --self-test
#
# Exit status: 0 clean, 1 an unredirected removal, 2 nothing to compare (fails closed).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(dirname "$SCRIPT_DIR")"
# shellcheck source-path=SCRIPTDIR source=lib/docs_routes.sh
source "$SCRIPT_DIR/lib/docs_routes.sh"
MANIFEST="$DOCS_ROOT/snapshots/published-static.txt"
generated_re='^(aztec-nr-api|typescript-api)(/|$)'

# Prints sorted static/ paths (relative to static/) from `git ls-files <args>`, generated trees
# dropped. A name the one-per-line inventory cannot hold (a newline, a leading `#`, only
# whitespace) fails rather than drop out of the comparison. Errexit is off inside $(...), so every
# caller propagates failures by hand.
function git_static_names {
  local list name
  list=$(mktemp)
  # shellcheck disable=SC2064 # expand now: the trap outlives this local
  trap "rm -f '$list'" RETURN
  git -C "$DOCS_ROOT" ls-files -z "$@" -- static >"$list" || return 2
  while IFS= read -r -d '' name; do
    name=${name#static/}
    if [[ "$name" == *$'\n'* || "$name" == '#'* || ! "$name" =~ [^[:space:]] ]]; then
      printf 'check_static_redirects: the inventory cannot list static/%q; rename it\n' "$name" >&2
      return 2
    fi
    [[ "$name" =~ $generated_re ]] || printf '%s\n' "$name"
  done <"$list" | LC_ALL=C sort -u
}

# Tracked files that are still in the working tree: an unstaged deletion counts as removed.
function served_static {
  local tracked deleted
  tracked=$(git_static_names) || return
  deleted=$(git_static_names --deleted) || return
  LC_ALL=C comm -23 <(printf '%s' "${tracked:+$tracked$'\n'}") <(printf '%s' "${deleted:+$deleted$'\n'}")
}

function listed_static {
  [[ -r "$MANIFEST" ]] || { echo "check_static_redirects: cannot read $MANIFEST" >&2; return 2; }
  grep -v -e '^#' -e '^[[:space:]]*$' "$MANIFEST" | grep -Ev "$generated_re" | LC_ALL=C sort -u || true
}

function check {
  local served listed removed unlisted path url failed=0 redirected=0
  served=$(served_static) || return
  listed=$(listed_static) || return
  if [[ -z "$served" || -z "$listed" ]]; then
    echo "check_static_redirects: no served static files or an empty inventory, so nothing was checked" >&2
    return 2
  fi
  removed=$(LC_ALL=C comm -13 <(printf '%s\n' "$served") <(printf '%s\n' "$listed"))
  unlisted=$(LC_ALL=C comm -23 <(printf '%s\n' "$served") <(printf '%s\n' "$listed"))
  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    url=$(url_encode_path "/$path")
    if matches_any_redirect "$url"; then
      redirected=$((redirected + 1))
    else
      echo "static/$path: published at $url, and no netlify.toml [[redirects]] from matches it; add one with from = \"$url\""
      failed=$((failed + 1))
    fi
  done <<<"$removed"
  printf 'check_static_redirects: %d served, %d listed, %d removed and redirected, %d removed without a redirect, %d served but not listed yet (the release snapshot refresh adds them)\n' \
    "$(grep -c . <<<"$served")" "$(grep -c . <<<"$listed")" "$redirected" "$failed" "$(grep -c . <<<"$unlisted" || true)"
  [[ "$failed" == 0 ]]
}

function update {
  local served kept tmp added
  served=$(served_static) || return
  [[ -n "$served" ]] || { echo "check_static_redirects: no served static files" >&2; return 2; }
  [[ -r "$MANIFEST" ]] || { echo "check_static_redirects: cannot read $MANIFEST" >&2; return 2; }
  kept=$(grep -v -e '^#' -e '^[[:space:]]*$' "$MANIFEST" || true)
  tmp=$(mktemp)
  {
    grep '^#' "$MANIFEST" || true
    printf '%s\n%s\n' "$kept" "$served" | grep -v '^[[:space:]]*$' | LC_ALL=C sort -u
  } >"$tmp"
  added=$(($(grep -vc '^#' "$tmp") - $(grep -c . <<<"$kept" || true)))
  cat "$tmp" >"$MANIFEST"
  rm -f "$tmp"
  echo "check_static_redirects: added $added served static files to ${MANIFEST#"$DOCS_ROOT"/}"
}

# Each fixture: <file under static/> | <netlify.toml line(s) for it, \n-separated> | ok or fail.
# The pattern answers are netlify-redirector 0.5.0's, the engine netlify-cli embeds.
function self_test {
  local tmp rc=0 got want st
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' RETURN
  local fixtures=(
    "img/Aztec Wordmark_Dark.svg|from = \"/img/Aztec%20Wordmark_Dark.svg\"|ok"
    "img/Aztec Symbol_Light.png|from = \"/img/Aztec Symbol_Light.png\"|fail"
    "img/Logo.PNG|from = \"/img/logo.png\"|fail"
    "img/Icon.svg||fail"
    "old/a/b.png|from = \"/old/*\"|ok"
    "fonts/x/file.woff2|from = \"/fonts/:name/file.woff2\"|ok"
    "img3/a.jpg|from = \"/img3/:name.png\"|ok"
    "img/axb.png|from = \"/img/a*b.png\"|fail"
    "x-1/file|from = \"/x-:id/file\"|fail"
    "img2/a.jpg|from = \"/img2/:\"|fail"
    "t/f.png|from = \"/t/f.png//\"|ok"
    "café.png|from = \"/caf%C3%A9.png\"|ok"
    "naïve.png|from = \"/na%c3%afve.png\"|fail"
    "tc.svg|[[redirects]] # trailing comment\nfrom = \"/tc.svg\"|ok"
    "commented.svg|# from = \"/commented.svg\"|fail"
    "hdr.svg|[[headers]]\nfor = \"/*\"\n[headers.values]\nfrom = \"/hdr.svg\"|fail"
    "sub.svg|[[redirects]]\nfrom = \"/real\"\nto = \"/x\"\n[redirects.headers]\nfrom = \"/sub.svg\"|fail"
    "subq.svg|[[redirects]]\nfrom = \"/real2\"\nto = \"/x\"\n[ redirects . query ] # q\nfrom = \"/subq.svg\"|fail"
    "ml.svg|[[redirects]]\nfrom = \"\"\"\nfrom = \"/ml.svg\"\n\"\"\"\nto = \"/x\"|fail"
    "mlto.svg|[[redirects]]\nfrom = \"/real3\"\nto = '''\nfrom = \"/mlto.svg\"\n'''|fail"
    "aztec-nr-api/mainnet/gone.html||ignored"
  )
  local fixture file rules verdict expected="" listed="" toml=""
  for fixture in "${fixtures[@]}"; do
    IFS='|' read -r file rules verdict <<<"$fixture"
    listed+="$file"$'\n'
    if [[ "$rules" == *'[['* ]]; then
      toml+=$(printf '%b' "$rules")$'\n\n'
    elif [[ -n "$rules" ]]; then
      toml+="[[redirects]]"$'\n'"  $(printf '%b' "$rules")"$'\n'"  to = \"/x\""$'\n\n'
    fi
    [[ "$verdict" == fail ]] && expected+="static/$file"$'\n'
  done
  expected+="static/img/unstaged.svg"$'\n'

  mkdir -p "$tmp/static/img" "$tmp/static/aztec-nr-api/mainnet" "$tmp/snapshots"
  printf '%s' "$toml" >"$tmp/netlify.toml"
  for file in img/present.svg img/icon.svg img/new.png img/unstaged.svg aztec-nr-api/mainnet/kept.html; do
    : >"$tmp/static/$file"
  done
  git -C "$tmp" init -q
  git -C "$tmp" add static
  rm "$tmp/static/img/unstaged.svg"
  printf '# Header kept by --update.\n%s' "${listed}img/present.svg"$'\n'"img/icon.svg"$'\n'"img/unstaged.svg"$'\n' >"$tmp/snapshots/published-static.txt"

  (
    DOCS_ROOT="$tmp" NETLIFY_TOML="$tmp/netlify.toml" MANIFEST="$tmp/snapshots/published-static.txt"
    docs_routes_init_redirects
    st=0
    got=$(check) || st=$?
    [[ "$st" == 1 ]] || { echo "self-test: the check exited $st, not 1" >&2; exit 1; }
    want=$(printf '%s' "$expected" | LC_ALL=C sort)
    got=$(grep -v '^check_static_redirects: ' <<<"$got" | sed -E 's/: published at .*//' | LC_ALL=C sort)
    [[ "$got" == "$want" ]] || { echo "self-test: failing files differ (want < > got):" >&2; diff <(echo "$want") <(echo "$got") >&2 || true; exit 1; }
    local out before
    out=$(check) || true
    got=$(grep '^static/img/Aztec Symbol_Light.png:' <<<"$out" || true)
    want='static/img/Aztec Symbol_Light.png: published at /img/Aztec%20Symbol_Light.png, and no netlify.toml [[redirects]] from matches it; add one with from = "/img/Aztec%20Symbol_Light.png"'
    [[ "$got" == "$want" ]] || { echo "self-test: the failure line is: $got" >&2; exit 1; }
    [[ "$out" == *', 1 served but not listed yet'* ]] || { echo "self-test: img/new.png is not counted as not listed" >&2; exit 1; }

    before=$(grep -c . "$MANIFEST")
    update >/dev/null
    [[ "$(head -1 "$MANIFEST")" == "# Header kept by --update." ]] || { echo "self-test: --update dropped the header" >&2; exit 1; }
    [[ "$(grep -c . "$MANIFEST")" == $((before + 1)) ]] || { echo "self-test: --update did not add exactly img/new.png" >&2; exit 1; }
    out=$(check) || true
    [[ "$out" == *', 0 served but not listed yet'* ]] || { echo "self-test: --update left a file unlisted" >&2; exit 1; }

    : >"$MANIFEST"
    st=0
    check >/dev/null 2>&1 || st=$?
    [[ "$st" == 2 ]] || { echo "self-test: an empty inventory exited $st, not 2" >&2; exit 1; }

    # Names the one-per-line inventory cannot hold must stop the check, not shrink its input.
    printf 'img/present.svg\n' >"$MANIFEST"
    local odd
    for odd in '#x.svg' ' ' $'a\nb.png'; do
      : >"$tmp/static/$odd"
      git -C "$tmp" add "static/$odd"
      st=0
      check >/dev/null 2>&1 || st=$?
      [[ "$st" == 2 ]] || { printf 'self-test: a file named %q exited %s, not 2\n' "$odd" "$st" >&2; exit 1; }
      git -C "$tmp" rm -q --cached "static/$odd"
      rm "$tmp/static/$odd"
    done
    st=0
    (NETLIFY_TOML="$tmp/missing.toml" docs_routes_init_redirects) 2>/dev/null || st=$?
    [[ "$st" != 0 ]] || { echo "self-test: a missing netlify.toml initialized" >&2; exit 1; }
  ) || rc=1

  # The engine's answers for each pattern shape: <from>|<path>|<1 match, 0 no match>.
  local cases=(
    "/assets/*|/assets|1" "/assets/*|/assets/|1" "/assets/*|/assets/x/y|1" "/assets/*|/assetsx|0"
    "/a/*/b|/a/b|1" "/a/*/b|/a/x/y/b|1" "/a/*/b|/a/x/c|0" "/q/:a/*|/q/1|1" "/q/:a/*|/q|0"
    "/p/:a/:b|/p/1/2/|1" "/p/:a/:b|/p/1|0" "/dir//|/dir|1" "/dir//|/dir/|1" "/dir//|/dir//|0"
    "/c/:a/|/c/1//|0" "/img/Case.PNG|/img/case.png|0" "/img/a*b.png|/img/a*b.png|1"
    "zk-money/userguide|/zk-money/userguide|1" "/|/|1"
  )
  local case_ from path match re
  for case_ in "${cases[@]}"; do
    IFS='|' read -r from path match <<<"$case_"
    re=$(from_to_regex "$from")
    if [[ "$path" =~ $re ]]; then got=1; else got=0; fi
    [[ "$got" == "$match" ]] || { echo "self-test: $from vs $path gave $got, the engine $match" >&2; rc=1; }
  done

  # The browser's encoding (WHATWG URL), plus the four characters a file name needs escaped.
  local chars=$' !"$&\'()*+,-.:;<=>@[]^_`{|}~é\x7f'
  want=$(node -e 'process.stdout.write(new URL("https://h/" + process.argv[1]).pathname)' "a${chars}b")
  got=$(url_encode_path "/a${chars}b")
  [[ "$got" == "$want" ]] || { echo "self-test: url_encode_path gave $got, URL gives $want" >&2; rc=1; }
  got=$(url_encode_path '/a%#?\b')
  [[ "$got" == '/a%25%23%3F%5Cb' ]] || { echo "self-test: url_encode_path escaped % # ? \\ as $got" >&2; rc=1; }

  [[ "$rc" == 0 ]] && echo "check_static_redirects self-test: ${#fixtures[@]} inventory fixtures, ${#cases[@]} pattern cases, the encoder"
  return "$rc"
}

case "${1:-}" in
  --self-test) self_test ;;
  --update) update ;;
  "")
    docs_routes_init_redirects
    check
    ;;
  *)
    echo "usage: $0 [--update | --self-test]" >&2
    exit 2
    ;;
esac
