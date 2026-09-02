#!/usr/bin/env bash
# Stages the native bb / bb-avm binaries into their npm platform packages and verifies them
# against the GitHub release tarballs.
#   stage <bb|bb-avm> [<arch-os>...]   copy from the cpp build dirs (native, or the named
#                                      cross builds; a release stages every platform), run
#                                      finalize_bb_binary (strip + version) on each copy
#   verify <bb|bb-avm>                 every staged binary must be byte-identical to the one
#                                      in barretenberg/cpp/build-release/*.tar.gz
set -euo pipefail
NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source
cd "$(dirname "$0")/.."
cpp=$(pwd)/../cpp

cmd=${1:?usage: $0 stage|verify <bb|bb-avm> [<arch-os>...]}; name=${2:?bb|bb-avm}; shift 2
case "$name" in
  bb) dir=bb-cli; all="amd64-linux arm64-linux amd64-macos arm64-macos amd64-windows" ;;
  bb-avm) dir=bb-avm-cli; all="amd64-linux arm64-linux" ;;
  *) echo "unknown binary $name" >&2; exit 1 ;;
esac

# cpp build layout -> npm platform suffix.
function suffix { case "$1" in
  amd64-linux) echo linux-x64 ;; arm64-linux) echo linux-arm64 ;;
  amd64-macos) echo darwin-x64 ;; arm64-macos) echo darwin-arm64 ;;
  amd64-windows) echo win32-x64 ;; *) echo "unknown platform $1" >&2; exit 1 ;; esac; }
function file_name { [ "$1" = amd64-windows ] && echo "$name.exe" || echo "$name"; }
# The platform package's package.json. Generated on demand rather than committed: barretenberg/ts/
# .gitignore ignores packages/, so a checkout has no manifests, and the os/cpu/name are all
# mechanical from the suffix. The version is a placeholder; release_prep_package_json stamps the
# release version at publish, and the meta package's optionalDependencies are stamped to match.
function write_manifest {
  local pkg_dir=$1 sfx=$2 osname=${2%%-*} cpu=${2#*-}
  [ "$osname" = darwin ] || [ "$osname" = win32 ] || osname=linux
  cat > "$pkg_dir/package.json" <<JSON
{
  "name": "@aztec-foundation/$name-$sfx",
  "version": "0.1.0",
  "description": "$name binary for $sfx",
  "license": "MIT",
  "os": ["$osname"],
  "cpu": ["$cpu"],
  "files": ["bin/"],
  "preferUnplugged": true,
  "repository": {
    "type": "git",
    "url": "git+https://github.com/AztecProtocol/aztec-packages.git",
    "directory": "barretenberg/ts/$dir/packages/$name-$sfx"
  }
}
JSON
}
function build_dir { [ "$1" = "$(arch)-$(os)" ] && echo "$cpp/build" || echo "$cpp/build-$1"; }
# Release tarball for a platform (release dir naming uses darwin/windows, build dirs macos/windows).
function tarball { case "$1" in
  amd64-linux|arm64-linux) echo "$cpp/build-release/barretenberg${name#bb}-$1.tar.gz" ;;
  amd64-macos) echo "$cpp/build-release/barretenberg-amd64-darwin.tar.gz" ;;
  arm64-macos) echo "$cpp/build-release/barretenberg-arm64-darwin.tar.gz" ;;
  amd64-windows) echo "$cpp/build-release/barretenberg-amd64-windows.tar.gz" ;; esac; }

case "$cmd" in
  stage)
    if [ $# -gt 0 ]; then platforms="$*"; elif [ -n "${REF_NAME:-}" ] && semver check "$REF_NAME" && [ "$(arch)" = amd64 ]; then platforms=$all; else platforms="$(arch)-$(os)"; fi
    for p in $platforms; do
      src="$(build_dir "$p")/bin/$(file_name "$p")"
      [ -f "$src" ] || { echo "native_packages: $src not built" >&2; exit 1; }
      dest="$dir/packages/$name-$(suffix "$p")/bin"
      mkdir -p "$dest"
      write_manifest "$dir/packages/$name-$(suffix "$p")" "$(suffix "$p")"
      cp "$src" "$dest/$(file_name "$p")"
      # The cpp bootstrap cds into its own directory: hand it an absolute path.
      "$cpp/bootstrap.sh" finalize_bb_binary "$(pwd)/$dest/$(file_name "$p")"
      echo "staged $name for $(suffix "$p") ($(sha256sum "$dest/$(file_name "$p")" | cut -c1-12))"
    done
    ;;
  verify)
    fail=0
    for p in $all; do
      staged="$dir/packages/$name-$(suffix "$p")/bin/$(file_name "$p")"
      [ -f "$staged" ] || continue
      tb=$(tarball "$p")
      [ -f "$tb" ] || { echo "native_packages: no release tarball $tb for $p" >&2; fail=1; continue; }
      a=$(sha256sum "$staged" | cut -d' ' -f1)
      b=$(tar -xOzf "$tb" "$(file_name "$p")" | sha256sum | cut -d' ' -f1)
      if [ "$a" = "$b" ]; then echo "parity ok: $name $(suffix "$p") ${a:0:12}"; else echo "PARITY MISMATCH: $name $(suffix "$p") npm=${a:0:12} tarball=${b:0:12}" >&2; fail=1; fi
    done
    exit $fail
    ;;
  *) echo "unknown command $cmd" >&2; exit 1 ;;
esac
