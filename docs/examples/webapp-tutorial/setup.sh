#!/bin/bash
# Setup script for the webapp-tutorial example.
# Resolves #include_aztec_version macros in package.json and installs dependencies.
set -euo pipefail

cd "$(dirname "$0")"

# The Labs version the tutorial page names. This repository's own tags are Foundation versions, so the
# checkout cannot supply it.
VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]]; then
  echo "Usage: ./setup.sh <version>, the Aztec version the tutorial names (e.g. ./setup.sh 6.0.0), without a leading v." >&2
  exit 1
fi

echo "Resolving #include_aztec_version to $VERSION ..."

node -e '
  const fs = require("fs");
  const version = process.argv[1];
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  for (const section of ["dependencies", "devDependencies"]) {
    for (const [name, ver] of Object.entries(pkg[section] || {})) {
      if (ver === "#include_aztec_version") {
        pkg[section][name] = version;
      }
    }
  }
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
' "$VERSION"

echo "Installing dependencies..."
# Without its own lockfile, yarn 4 treats this directory as part of the docs/ workspace and refuses to install.
[ -f yarn.lock ] || touch yarn.lock
yarn install

echo "Setup complete!"
