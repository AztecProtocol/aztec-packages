#!/bin/bash
set -eu

NAMESPACE=${1:-staging}

echo "Trying to port forward. NOTE: Must be using a production k8s context with metrics chart."

# Helper function to get load balancer URL based on namespace and service name
function get_load_balancer_url() {
  local namespace=$1
  local service_name=$2
  kubectl get svc -n $namespace -o jsonpath="{.items[?(@.metadata.name=='$service_name')].status.loadBalancer.ingress[0].hostname}"
}

# Fetch the service URLs based on the namespace for injection in the test-transfer.sh
OTEL_URL=http://$(get_load_balancer_url metrics metrics-opentelemetry-collector):4318

export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=$OTEL_URL/v1/metrics
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=$OTEL_URL/v1/traces
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=$OTEL_URL/v1/logs
export LOG_JSON=1

# re-enter script dir
cd $(dirname "${BASH_SOURCE[0]}")
./run_native_testnet.sh $@