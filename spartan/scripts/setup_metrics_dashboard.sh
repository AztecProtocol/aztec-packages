#!/bin/bash

helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm repo add elastic https://helm.elastic.co
helm repo update
helm dependency build "$(git rev-parse --show-toplevel)/spartan/metrics/"
kubectl create -f https://download.elastic.co/downloads/eck/2.14.0/crds.yaml 2>/dev/null
kubectl create secret generic elasticsearch-es-elastic-user --from-literal=elastic=admin -n metrics
kubectl apply -f https://download.elastic.co/downloads/eck/2.14.0/operator.yaml
helm upgrade --install metrics "$(git rev-parse --show-toplevel)/spartan/metrics/" --wait --namespace metrics --create-namespace --wait-for-jobs=true --timeout=30m