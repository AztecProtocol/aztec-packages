#!/usr/bin/env bash
# Lints the docs' own shell scripts with shellcheck 0.11.0, or the files given (`-` reads stdin).
# Uses a shellcheck 0.11.0 on PATH, else the release archive, downloaded once into the user cache and
# checked against its pinned SHA-256 before it is extracted.
set -euo pipefail

VERSION=0.11.0
docs=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cache="${XDG_CACHE_HOME:-$HOME/.cache}/aztec-docs"
cached="$cache/shellcheck-v$VERSION/shellcheck"

die() {
  echo "shellcheck.sh: $*" >&2
  exit 1
}

platform() {
  local os arch
  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    *) die "shellcheck $VERSION has no build for $(uname -s)" ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=x86_64 ;;
    aarch64 | arm64) arch=aarch64 ;;
    *) die "shellcheck $VERSION has no build for $(uname -m)" ;;
  esac
  echo "$os.$arch"
}

# GitHub's recorded digest of each release asset, matched by a download of each.
pinned_sha256() {
  case "$1" in
    linux.x86_64) echo b7af85e41cc99489dcc21d66c6d5f3685138f06d34651e6d34b42ec6d54fe6f6 ;;
    linux.aarch64) echo 68a8133197a50beb8803f8d42f9908d1af1c5540d4bb05fdfca8c1fa47decefc ;;
    darwin.x86_64) echo c2c15e08df0e8fbc374c335b230a7ee958c313fa5714817a59aa59f1aa594f51 ;;
    darwin.aarch64) echo 339b930feb1ea764467013cc1f72d09cd6b869ebf1013296ba9055ab2ffbd26f ;;
  esac
}

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1
}

download() {
  local target url archive err
  target=$(platform)
  url="https://github.com/koalaman/shellcheck/releases/download/v$VERSION/shellcheck-v$VERSION.$target.tar.gz"
  mkdir -p "$cache"
  staging=$(mktemp -d "$cache/shellcheck-staging.XXXXXX")
  trap 'rm -rf "$staging"' EXIT
  archive="$staging/shellcheck.tar.gz"
  err="$staging/err"
  # One retry covers a dropped connection; a digest mismatch is never retried.
  if ! curl --fail --silent --show-error --location --max-time 60 -o "$archive" "$url" 2>"$err" &&
    ! curl --fail --silent --show-error --location --max-time 60 -o "$archive" "$url" 2>"$err"; then
    die "could not download $url: $(tail -n 1 "$err")"
  fi
  [ "$(sha256 "$archive")" = "$(pinned_sha256 "$target")" ] || die "$url does not match its pinned SHA-256"
  tar -xzf "$archive" -C "$staging" 2>"$err" || die "could not extract $url: $(tail -n 1 "$err")"
  mkdir -p "$(dirname "$cached")"
  # A rename within the cache is atomic, so a concurrent run never executes a partial binary.
  mv "$staging/shellcheck-v$VERSION/shellcheck" "$cached"
}

if command -v shellcheck >/dev/null && [ "$(shellcheck --version | sed -n 's/^version: //p')" = "$VERSION" ]; then
  shellcheck=shellcheck
else
  if [ ! -x "$cached" ]; then download; fi
  shellcheck=$cached
fi

cd "$docs"
if [ $# -eq 0 ]; then
  scripts=()
  while IFS= read -r script; do scripts+=("$script"); done < <(git ls-files bootstrap.sh 'scripts/*.sh')
  set -- "${scripts[@]}"
fi
"$shellcheck" "$@"
