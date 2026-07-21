#!/bin/bash
set -euo pipefail

VERSION="${1:?Usage: $0 <version>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rm "$DIR"/external-secrets-*.tgz

helm repo add external-secrets https://charts.external-secrets.io --force-update >/dev/null
helm pull external-secrets/external-secrets --version "$VERSION" --destination "$DIR"

sed -i "s/external-secrets-.*\.tgz/external-secrets-${VERSION}.tgz/" "$DIR/main.tf"

echo "Updated to external-secrets $VERSION"
