#!/bin/bash
# Setup script for the webapp-tutorial example.
# Resolves #include_aztec_version macros in package.json and installs dependencies.
set -euo pipefail

cd "$(dirname "$0")"

# Determine version from the checked-out git tag (readers check out a release tag)
VERSION="${1:-$(git describe --tags --exact-match 2>/dev/null || echo "")}"

if [ -z "$VERSION" ]; then
  echo "Error: Could not determine Aztec version from git tag."
  echo "Usage: ./setup.sh <version>  (e.g., ./setup.sh 0.87.0)"
  echo "Or check out a release tag first: git checkout <version>"
  exit 1
fi

echo "Resolving #include_aztec_version to $VERSION ..."

node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  for (const section of ['dependencies', 'devDependencies']) {
    for (const [name, ver] of Object.entries(pkg[section] || {})) {
      if (ver === '#include_aztec_version') {
        pkg[section][name] = '$VERSION';
      }
    }
  }
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

echo "Installing dependencies..."
yarn install

echo "Setup complete!"
