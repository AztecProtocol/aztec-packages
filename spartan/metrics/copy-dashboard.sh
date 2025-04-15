#!/usr/bin/env bash
set -eu

cd "$(dirname "${BASH_SOURCE[0]}")"

cp values.tmp.yaml values.yaml

for dashboard_file in ./grafana/dashboards/*.json; do
  full_filename=$(basename "$dashboard_file" .json)

  # Extract folder name and dashboard name using underscore as separator
  # Format: foldername_dashboardname.json
  if [[ "$full_filename" == *"_"* ]]; then
    folder_name=${full_filename%%_*}
    dashboard_name=${full_filename#*_}
  else
    # If no underscore, use "default" as the folder
    folder_name="default"
    dashboard_name=$full_filename
  fi

  export dashboard_content=$(jq -c '.' "$dashboard_file")
  yq -i ".grafana.dashboards.${folder_name}.${dashboard_name}.json = strenv(dashboard_content)" values.yaml
done

for file in ./grafana/alerts/*.yaml; do
  file_name=$(basename "$file" .yaml)
  export file_content=$(cat "$file" )
  yq -i ".grafana.alerting.\"${file_name}.yaml\" = env(file_content)" values.yaml
done
