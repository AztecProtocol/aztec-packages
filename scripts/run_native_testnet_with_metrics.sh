#!/bin/bash
set -eu

echo "Trying to port forward. NOTE: Must be using a k8s context with metrics chart installed"
kubectl port-forward svc/metrics-opentelemetry-collector 4318:4318 -n metrics &

export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://127.0.0.1:4318/v1/metrics
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/trace
export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://127.0.0.1:4318/v1/logs

# re-enter script dir
cd $(dirname "${BASH_SOURCE[0]}")
./run_native_testnet.sh $@