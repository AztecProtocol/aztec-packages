
#!/bin/bash

set -ex

VERSION_FILE="/usr/src/.release-please-manifest.json"

declare -A attrs_map

attrs_map["service.version"]="0.0.0";
if [[ -f "$VERSION_FILE" ]]; then
  # there's a single version of the whole monocontainer
  attrs_map["service.version"]=$(jq -r '.["."]' "$VERSION_FILE")
fi

OTEL_SERVICE_NAME="${OTEL_SERVICE_NAME:-unknown_service}"
attrs_map["service.name"]="$OTEL_SERVICE_NAME"

# format the attribute map to comma-separated string
otel_attrs=""
for key in "${!attrs_map[@]}"; do
  if [[ -n "$otel_attrs" ]]; then
    otel_attrs="${otel_attrs},"
  fi
  otel_attrs="${otel_attrs}${key}=${attrs_map[$key]}"
done

if [[ -n "$OTEL_RESOURCE_ATTRIBUTES" ]]; then
  export OTEL_RESOURCE_ATTRIBUTES="${OTEL_RESOURCE_ATTRIBUTES},${otel_attrs}"
else
  export OTEL_RESOURCE_ATTRIBUTES="$otel_attrs"
fi

cat <<EOF >/shared/config/otel-resource
export OTEL_RESOURCE_ATTRIBUTES="$OTEL_RESOURCE_ATTRIBUTES"
export OTEL_SERVICE_NAME="$OTEL_SERVICE_NAME"
EOF

cat /shared/config/otel-resource
