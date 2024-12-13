#!/bin/bash
set -eu

cd "$(dirname "${BASH_SOURCE[0]}")"

helm upgrade metrics . -n metrics --values "./values/prod.yaml" --install --create-namespace $@
