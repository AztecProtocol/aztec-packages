#!/bin/bash

SCRIPT_DIR="$(dirname $(realpath -s "${BASH_SOURCE[0]}"))"
cd "$SCRIPT_DIR"

# check if chaos-mesh is already installed
if helm ls --namespace chaos-mesh | grep -q chaos; then
  echo "chaos-mesh is already installed"
  exit 0
fi

helm repo add chaos-mesh https://charts.chaos-mesh.org
helm dependency update
helm upgrade chaos "$SCRIPT_DIR" -n chaos-mesh --install --create-namespace --atomic

