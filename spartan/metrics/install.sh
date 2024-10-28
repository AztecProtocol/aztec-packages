#!/bin/bash
set -eu

cd "$(dirname "${BASH_SOURCE[0]}")"

helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm dependency update
helm template metrics . -n metrics  #--install --create-namespace --atomic
