#!/usr/bin/env bash
# Generates architecture-specific npm packages from cross-compiled binaries.
# Each package contains only the native bb binary and nodejs_module.node for one platform.
# These are published as optionalDependencies of @aztec/bb.js so users only download
# the binaries for their platform.
set -euo pipefail

cd "$(dirname "$0")/.."

# Mapping: build_dir → npm_package_suffix os cpu
declare -A PLATFORMS=(
  ["amd64-linux"]="linux-x64 linux x64"
  ["arm64-linux"]="linux-arm64 linux arm64"
  ["amd64-macos"]="darwin-x64 darwin x64"
  ["arm64-macos"]="darwin-arm64 darwin arm64"
)

# Read version from the wrapper package.json
version=$(jq -r '.version' package.json)

for build_dir in "${!PLATFORMS[@]}"; do
  read -r suffix os cpu <<< "${PLATFORMS[$build_dir]}"
  pkg_name="@aztec/bb.js-${suffix}"
  out_dir="packages/bb.js-${suffix}"

  # Skip if no binaries exist for this platform
  if [ ! -d "build/${build_dir}" ]; then
    echo "Skipping ${pkg_name}: no build/${build_dir} directory"
    continue
  fi

  echo "Preparing ${pkg_name} from build/${build_dir}..."
  rm -rf "${out_dir}"
  mkdir -p "${out_dir}"

  # Copy native binaries
  cp "build/${build_dir}/bb" "${out_dir}/bb" 2>/dev/null || true
  cp "build/${build_dir}/nodejs_module.node" "${out_dir}/nodejs_module.node" 2>/dev/null || true

  # Generate package.json
  cat > "${out_dir}/package.json" <<EOF
{
  "name": "${pkg_name}",
  "version": "${version}",
  "description": "Native binaries for @aztec/bb.js (${suffix})",
  "license": "MIT",
  "os": ["${os}"],
  "cpu": ["${cpu}"],
  "files": ["bb", "nodejs_module.node"],
  "preferUnplugged": true
}
EOF

  echo "  → ${out_dir}/ ready"
done

echo "Architecture packages prepared."
