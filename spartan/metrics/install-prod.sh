#!/bin/bash
set -eu

cd "$(dirname "${BASH_SOURCE[0]}")"

DASHBOARD_JSON=$(jq -c '.' grafana_dashboards/aztec-dashboard-all-in-one.json)
DASHBOARD_JSON=$DASHBOARD_JSON yq e '.grafana.dashboards.default."aztec-networks".json = strenv(DASHBOARD_JSON)' values.tmp.yaml > values.yaml

helm upgrade metrics . -n metrics --values "./values/prod.yaml" --install --create-namespace $@
