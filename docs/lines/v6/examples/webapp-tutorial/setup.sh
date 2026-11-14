#!/bin/bash
# Setup script for the webapp-tutorial example.
# Resolves the version macros in package.json and .yarnrc.yml and installs dependencies.
set -euo pipefail

cd "$(dirname "$0")"

# The Labs version the tutorial page names, and the version of the @aztec-foundation/* packages its
# packages depend on. This repository's own tags are Foundation versions, so the checkout cannot supply them.
VERSION="${1:-}" FOUNDATION_VERSION="${2:-}"
semver='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'
if [[ ! "$VERSION" =~ $semver || ! "$FOUNDATION_VERSION" =~ $semver ]]; then
  echo "Usage: ./setup.sh <version> <foundation version>, the two versions the tutorial names (e.g. ./setup.sh 6.0.0 6.0.0), without a leading v." >&2
  exit 1
fi

echo "Resolving #include_aztec_version to $VERSION and #include_foundation_version to $FOUNDATION_VERSION ..."

# .yarnrc.yml exempts the first-party packages from the age gate at these versions only, so a later
# publication still waits it out.
node -e '
  const fs = require("fs");
  const [version, foundation] = process.argv.slice(1);
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  for (const section of ["dependencies", "devDependencies"]) {
    for (const [name, ver] of Object.entries(pkg[section] || {})) {
      if (ver === "#include_aztec_version") {
        pkg[section][name] = version;
      }
    }
  }
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
  const rc = fs.readFileSync(".yarnrc.yml", "utf8");
  fs.writeFileSync(".yarnrc.yml", rc.replaceAll("#include_aztec_version", version).replaceAll("#include_foundation_version", foundation));
' "$VERSION" "$FOUNDATION_VERSION"

echo "Installing dependencies..."
# Without its own lockfile, yarn 4 treats this directory as part of the docs/ workspace and refuses to install.
[ -f yarn.lock ] || touch yarn.lock
yarn install

echo "Setup complete!"
