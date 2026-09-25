#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

declare -A PLATFORMS=(
  ["amd64-linux"]="linux-x64 linux x64"
  ["arm64-linux"]="linux-arm64 linux arm64"
  ["amd64-macos"]="darwin-x64 darwin x64"
  ["arm64-macos"]="darwin-arm64 darwin arm64"
)

NAPI_BINARY="nodejs_module.node"
version=$(node -p "require('./package.json').version")

declare -A BINARIES=()
for arg in "$@"; do
  case "$arg" in
    *=*)
      key="${arg%%=*}"
      value="${arg#*=}"
      BINARIES["$key"]="$value"
      ;;
    *)
      echo "Usage: npm run prepare_arch_packages -- [<platform>=<binary> ...]" >&2
      echo "Platforms: linux-x64, linux-arm64, darwin-x64, darwin-arm64" >&2
      exit 1
      ;;
  esac
done

for build_dir in "${!PLATFORMS[@]}"; do
  read -r suffix os cpu <<< "${PLATFORMS[$build_dir]}"
  pkg_name="@aztec-foundation/kvdb-${suffix}"
  out_dir="packages/kvdb-${suffix}"
  binary_path="${BINARIES[$suffix]:-${BINARIES[$build_dir]:-}}"

  if [ -z "$binary_path" ]; then
    binary_path="build/${build_dir}/${NAPI_BINARY}"
  fi

  # Always create the arch workspace stub so the workspace set (and lockfile) is
  # stable on single-arch builds. The os/cpu fields make npm install only the
  # matching package at runtime; the binary is copied in only where available.
  rm -rf "${out_dir}"
  mkdir -p "${out_dir}"
  if [ -f "$binary_path" ]; then
    cp "$binary_path" "${out_dir}/${NAPI_BINARY}"
  else
    echo "No binary for ${pkg_name} (${binary_path}); creating stub workspace package."
  fi

  cat > "${out_dir}/package.json" <<EOF
{
  "name": "${pkg_name}",
  "version": "${version}",
  "description": "Native NAPI addon for @aztec-foundation/kvdb (${suffix})",
  "license": "MIT",
  "os": ["${os}"],
  "cpu": ["${cpu}"],
  "files": ["${NAPI_BINARY}"],
  "preferUnplugged": true
}
EOF
done
