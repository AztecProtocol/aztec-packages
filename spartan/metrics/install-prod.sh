#!/bin/bash
set -eu

cd "$(dirname "${BASH_SOURCE[0]}")"

DASHBOARD_JSON=$(jq -c '.' grafana_dashboards/aztec-dashboard-all-in-one.json)
yq -Y --arg dashboard "$DASHBOARD_JSON" '.grafana.dashboards.default."aztec-networks".json = $dashboard' values.tmp.yaml > values.yaml

helm upgrade metrics . -n metrics --values "./values/prod.yaml" --install --create-namespace $@
