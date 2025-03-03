#!/bin/bash
set -eu

cd "$(dirname "${BASH_SOURCE[0]}")"

cp values.tmp.yaml values.yaml

for dashboard in ./grafana_dashboards/*.json; do
  dashboard_name=$(basename "$dashboard" .json)
  export DASHBOARD_JSON=$(jq -c '.' "$dashboard")
  yq -i ".grafana.dashboards.default.\"$dashboard_name\".json = strenv(DASHBOARD_JSON)" values.yaml
done
