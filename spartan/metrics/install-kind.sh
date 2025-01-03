#!/bin/bash
set -eu

SCRIPT_DIR="$(dirname $(realpath -s "${BASH_SOURCE[0]}"))"
cd "$SCRIPT_DIR"

# check if metrics is already installed
if helm ls --namespace metrics | grep -q metrics; then
  echo "metrics is already installed"
  exit 0
fi

# Inject the Aztec Networks dashboard into values.yaml
DASHBOARD_JSON=$(jq -c '.' grafana_dashboards/aztec-dashboard-all-in-one.json)
DASHBOARD_JSON=$DASHBOARD_JSON ~/bin/yq e '.grafana.dashboards.default."aztec-networks".json = strenv(DASHBOARD_JSON)' values.tmp.yaml > values.yaml

helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm dependency update
helm upgrade metrics "$SCRIPT_DIR" -n metrics --install --create-namespace --atomic --timeout 15m --values "$SCRIPT_DIR/values/kind.yaml"
