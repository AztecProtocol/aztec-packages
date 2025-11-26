#!/bin/bash

set -euo pipefail

# Create a Grafana Alertmanager silence during deploys (simple defaults)
#
# Usage:
#   GRAFANA_TOKEN=... ./silence-alerts.sh [DURATION_MINUTES]
#
# Defaults:
#   - Duration: 40 minutes
#   - Matcher: network = "testnet" (overridable via NETWORK_LABEL)
#   - CreatedBy: deploy-script
#   - Comment:  Silence all alerts during redeploy

GRAFANA_URL=${GRAFANA_URL:-"https://azteclabs.grafana.net"}
GRAFANA_TOKEN=${GRAFANA_TOKEN:-}

if [[ -z "${GRAFANA_TOKEN}" ]]; then
  echo "Error: GRAFANA_TOKEN is required (Grafana stack service account token with Alerting: write)" >&2
  exit 1
fi

DUR_MIN=${1:-40}
if ! [[ "${DUR_MIN}" =~ ^[0-9]+$ ]]; then
  echo "Error: duration must be an integer number of minutes (got '${DUR_MIN}')" >&2
  exit 1
fi

CREATED_BY=deploy-script
COMMENT="Silence all alerts during redeploy"

# Target network label (set NETWORK_LABEL to override)
NETWORK_LABEL=${NETWORK_LABEL:-"testnet"}

STARTS_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
ENDS_AT=$(date -u -d "+${DUR_MIN} minutes" +"%Y-%m-%dT%H:%M:%SZ")

BODY=$(cat <<JSON
{
  "matchers": [
    {
      "name": "network",
      "value": "${NETWORK_LABEL}",
      "isRegex": false
    }
  ],
  "startsAt": "${STARTS_AT}",
  "endsAt": "${ENDS_AT}",
  "createdBy": "${CREATED_BY}",
  "comment": "${COMMENT}"
}
JSON
)

echo "Creating silence on ${GRAFANA_URL} from ${STARTS_AT} to ${ENDS_AT} ..."
RESP=$(curl -s -w "\n%{http_code}" -X POST "${GRAFANA_URL}/api/alertmanager/grafana/api/v2/silences" \
  -H "Authorization: Bearer ${GRAFANA_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${BODY}")

HTTP_CODE=$(echo "${RESP}" | tail -n1)
BODY_JSON=$(echo "${RESP}" | head -n-1)

if [[ "${HTTP_CODE}" != "200" && "${HTTP_CODE}" != "201" && "${HTTP_CODE}" != "202" ]]; then
  echo "Error creating silence (HTTP ${HTTP_CODE}): ${BODY_JSON}" >&2
  exit 1
fi

echo "Silence created: ${BODY_JSON}"


