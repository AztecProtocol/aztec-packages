#!/usr/bin/env bash
# Stage a generated client package's per-platform binary packages, the optional dependencies its
# binary resolver looks for. Run from the package root; the package name and binary name come from
# its own package.json, so this is the same script for every service.
#
# Usage: prepare_arch_packages [<platform>=<binary> ...]
#   platform: linux-x64 | linux-arm64 | darwin-x64 | darwin-arm64, or a build dir name
#             (amd64-linux, arm64-linux, amd64-macos, arm64-macos)
# With no argument for a platform, build/<build-dir>/<binary> is used when it exists.
set -euo pipefail

declare -A PLATFORMS=(
  ["amd64-linux"]="linux-x64 linux x64"
  ["arm64-linux"]="linux-arm64 linux arm64"
  ["amd64-macos"]="darwin-x64 darwin x64"
  ["arm64-macos"]="darwin-arm64 darwin arm64"
)

read -r package_name binary_name version < <(node -p "
  const p = require('./package.json');
  [p.name, Object.keys(p.bin ?? {})[0] ?? '', p.version].join(' ');
")

if [ -z "$binary_name" ]; then
  echo "prepare_arch_packages: $package_name declares no bin, so it ships no binary" >&2
  exit 1
fi

# The scoped name's last segment, which is what the per-platform directories are named after.
stem="${package_name##*/}"

declare -A BINARIES=()
for arg in "$@"; do
  case "$arg" in
    *=*) BINARIES["${arg%%=*}"]="${arg#*=}" ;;
    *)
      echo "Usage: prepare_arch_packages [<platform>=<binary> ...]" >&2
      echo "Platforms: linux-x64, linux-arm64, darwin-x64, darwin-arm64" >&2
      exit 1
      ;;
  esac
done

for build_dir in "${!PLATFORMS[@]}"; do
  read -r suffix os cpu <<< "${PLATFORMS[$build_dir]}"
  pkg_name="${package_name}-${suffix}"
  out_dir="packages/${stem}-${suffix}"
  binary_path="${BINARIES[$suffix]:-${BINARIES[$build_dir]:-}}"

  if [ -z "$binary_path" ]; then
    binary_path="build/${build_dir}/${binary_name}"
  fi

  if [ ! -f "$binary_path" ]; then
    echo "Skipping ${pkg_name}: no binary at ${binary_path}"
    continue
  fi

  rm -rf "${out_dir}"
  mkdir -p "${out_dir}"
  cp "$binary_path" "${out_dir}/${binary_name}"
  chmod +x "${out_dir}/${binary_name}" 2>/dev/null || true

  cat > "${out_dir}/package.json" <<EOF
{
  "name": "${pkg_name}",
  "version": "${version}",
  "description": "Native binary for ${package_name} (${suffix})",
  "license": "MIT",
  "os": ["${os}"],
  "cpu": ["${cpu}"],
  "files": ["${binary_name}"],
  "preferUnplugged": true
}
EOF
done
