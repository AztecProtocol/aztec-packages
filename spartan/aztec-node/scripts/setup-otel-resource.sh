
#!/usr/bin/env bash

set -ex

VERSION_FILE="/usr/src/.release-please-manifest.json"

declare -A attrs_map

attrs_map["service.version"]="0.0.0";
if [[ -f "$VERSION_FILE" ]]; then
  # there's a single version of the whole monocontainer
  attrs_map["service.version"]=$(jq -r '.["."]' "$VERSION_FILE")
fi

export OTEL_SERVICE_NAME="${OTEL_SERVICE_NAME:-unknown_service}"
attrs_map["service.name"]="$OTEL_SERVICE_NAME"

attrs_map["service.instance.id"]="${K8S_POD_UID:-}"
attrs_map["service.namespace"]="${K8S_NAMESPACE_NAME:-}"

attrs_map["k8s.pod.ip"]="${POD_IP:-}"
attrs_map["k8s.pod.name"]="${K8S_POD_NAME:-}"
attrs_map["k8s.pod.uid"]="${K8S_POD_UID:-}"
attrs_map["k8s.namespace.name"]="${K8S_NAMESPACE_NAME:-}"

# format the attribute map to comma-separated string
set +x
otel_attrs=""
for key in "${!attrs_map[@]}"; do
  if [[ -n "$otel_attrs" ]]; then
    otel_attrs="${otel_attrs},"
  fi
  otel_attrs="${otel_attrs}${key}=${attrs_map[$key]}"
done
set -x

if [[ -n "$OTEL_RESOURCE_ATTRIBUTES" ]]; then
  export OTEL_RESOURCE_ATTRIBUTES="${OTEL_RESOURCE_ATTRIBUTES},${otel_attrs}"
else
  export OTEL_RESOURCE_ATTRIBUTES="$otel_attrs"
fi
