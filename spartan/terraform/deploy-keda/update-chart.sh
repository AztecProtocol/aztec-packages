#!/bin/bash
set -euo pipefail

VERSION="${1:?Usage: $0 <version>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rm "$DIR"/keda-*.tgz

helm repo add kedacore https://kedacore.github.io/charts --force-update >/dev/null
helm pull kedacore/keda --version "$VERSION" --destination "$DIR"

sed -i "s/keda-.*\.tgz/keda-${VERSION}.tgz/" "$DIR/main.tf"

echo "Updated to KEDA $VERSION"
