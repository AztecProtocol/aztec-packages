#!/bin/bash
set -euo pipefail

VERSION="${1:?Usage: $0 <version>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rm "$DIR"/alloy-*.tgz

helm repo add grafana https://grafana.github.io/helm-charts --force-update >/dev/null
helm pull grafana/alloy --version "$VERSION" --destination "$DIR"

sed -i "s/alloy-.*\.tgz/alloy-${VERSION}.tgz/" "$DIR/main.tf"

echo "Updated to Alloy $VERSION"
