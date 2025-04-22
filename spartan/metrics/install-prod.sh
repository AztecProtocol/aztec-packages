#!/usr/bin/env bash
set -eu

cd "$(dirname "${BASH_SOURCE[0]}")"

echo "Installing metrics (prod)"

./copy-dashboard.sh

helm upgrade metrics . -n metrics --values "./values/prod.yaml" --install --create-namespace $@
