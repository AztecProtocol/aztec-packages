#!/usr/bin/env bash

set -ex

# Get load balancer IP for service
function get_load_balancer_ip() {
  local SERVICE_LABEL=$1
  local PORT=$2
  local MAX_RETRIES=30
  local RETRY_INTERVAL=2
  local attempt=1

  # Check load balancer exists for service
  while [ $attempt -le $MAX_RETRIES ]; do
    LOAD_BALANCER_IP=$(kubectl get svc -n ${NAMESPACE} -l app=${SERVICE_LABEL} -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}')
    if [ -n "$LOAD_BALANCER_IP" ]; then
      break
    fi
    echo "Attempt $attempt: Waiting for ${SERVICE_LABEL} load balancer to be available..." >&2
    sleep $RETRY_INTERVAL
    attempt=$((attempt + 1))
  done

  if [ -z "$LOAD_BALANCER_IP" ]; then
    echo "Error: Failed to get load balancer IP after $MAX_RETRIES attempts" >&2
    return 1
  fi

  echo "Load balancer IP: ${LOAD_BALANCER_IP}" >&2
  echo "http://${LOAD_BALANCER_IP}:${PORT}"
}

# Function to get pod and node details
function get_service_address() {
  local SERVICE_LABEL=$1
  local PORT=$2
  local MAX_RETRIES=30
  local RETRY_INTERVAL=2
  local attempt=1

  # Get pod name
  while [ $attempt -le $MAX_RETRIES ]; do
    POD_NAME=$(kubectl get pods -n ${NAMESPACE} -l app=${SERVICE_LABEL} -o jsonpath='{.items[0].metadata.name}')
    if [ -n "$POD_NAME" ]; then
      break
    fi
    echo "Attempt $attempt: Waiting for ${SERVICE_LABEL} pod to be available..." >&2
    sleep $RETRY_INTERVAL
    attempt=$((attempt + 1))
  done

  if [ -z "$POD_NAME" ]; then
    echo "Error: Failed to get ${SERVICE_LABEL} pod name after $MAX_RETRIES attempts" >&2
    return 1
  fi
  echo "Pod name: [${POD_NAME}]" >&2

  # Get node name
  attempt=1
  NODE_NAME=""
  while [ $attempt -le $MAX_RETRIES ]; do
    NODE_NAME=$(kubectl get pod ${POD_NAME} -n ${NAMESPACE} -o jsonpath='{.spec.nodeName}')
    if [ -n "$NODE_NAME" ]; then
      break
    fi
    echo "Attempt $attempt: Waiting for node name to be available..." >&2
    sleep $RETRY_INTERVAL
    attempt=$((attempt + 1))
  done

  if [ -z "$NODE_NAME" ]; then
    echo "Error: Failed to get node name after $MAX_RETRIES attempts" >&2
    return 1
  fi
  echo "Node name: ${NODE_NAME}" >&2

  # Get the node's external IP
  NODE_IP=$(kubectl get node ${NODE_NAME} -o jsonpath='{.status.addresses[?(@.type=="ExternalIP")].address}')
  echo "Node IP: ${NODE_IP}" >&2
  echo "http://${NODE_IP}:${PORT}"
}

# Configure Ethereum execution client address
if [ "${EXTERNAL_ETHEREUM_HOSTS}" != "" ]; then
  ETHEREUM_ADDR="${EXTERNAL_ETHEREUM_HOSTS}"
elif [ "${NETWORK_PUBLIC}" = "true" ]; then
  ETHEREUM_ADDR=$(get_load_balancer_ip "eth-execution" "${ETHEREUM_PORT}")
else
  ETHEREUM_ADDR="http://${SERVICE_NAME}-eth-execution.${NAMESPACE}:${ETHEREUM_PORT}"
fi

# Configure Ethereum Consensus address
if [ "${EXTERNAL_ETHEREUM_CONSENSUS_HOST}" != "" ]; then
  ETHEREUM_CONSENSUS_ADDR="${EXTERNAL_ETHEREUM_CONSENSUS_HOST}"
elif [ "${NETWORK_PUBLIC}" = "true" ]; then
  ETHEREUM_CONSENSUS_ADDR=$(get_load_balancer_ip "eth-beacon" "${ETHEREUM_CONSENSUS_PORT}")
else
  ETHEREUM_CONSENSUS_ADDR="http://${SERVICE_NAME}-eth-beacon.${NAMESPACE}:${ETHEREUM_CONSENSUS_PORT}"
fi

# Configure Boot Node address
if [ "${EXTERNAL_BOOT_NODE_HOST}" != "" ]; then
  BOOT_NODE_ADDR="${EXTERNAL_BOOT_NODE_HOST}"
elif [ "${NETWORK_PUBLIC}" = "true" ]; then
  BOOT_NODE_ADDR=$(get_service_address "boot-node" "${BOOT_NODE_PORT}")
else
  BOOT_NODE_ADDR="http://${SERVICE_NAME}-boot-node.${NAMESPACE}:${BOOT_NODE_PORT}"
fi

# Configure Full Node address
if [ "${EXTERNAL_FULL_NODE_HOST}" != "" ]; then
  FULL_NODE_ADDR="${EXTERNAL_FULL_NODE_HOST}"
elif [ "${NETWORK_PUBLIC}" = "true" ]; then
  FULL_NODE_ADDR=$(get_service_address "full-node" "${FULL_NODE_PORT}")
else
  FULL_NODE_ADDR="http://${SERVICE_NAME}-full-node.${NAMESPACE}:${FULL_NODE_PORT}"
fi

# Configure Prover Node address
if [ "${EXTERNAL_PROVER_NODE_HOST}" != "" ]; then
  PROVER_NODE_ADDR="${EXTERNAL_PROVER_NODE_HOST}"
elif [ "${NETWORK_PUBLIC}" = "true" ]; then
  PROVER_NODE_ADDR=$(get_service_address "prover-node" "${PROVER_NODE_PORT}")
else
  PROVER_NODE_ADDR="http://${SERVICE_NAME}-prover-node.${NAMESPACE}:${PROVER_NODE_PORT}"
fi

if [ "${PROVER_BROKER_EXTERNAL_HOST}" != "" ]; then
  PROVER_BROKER_ADDR="${PROVER_BROKER_EXTERNAL_HOST}"
else
  PROVER_BROKER_ADDR="http://${SERVICE_NAME}-prover-broker.${NAMESPACE}:${PROVER_BROKER_PORT}"
fi

# Configure OTEL_COLLECTOR_ENDPOINT if not set in values file
if [ "${TELEMETRY:-false}" = "true" ] && [ "${OTEL_COLLECTOR_ENDPOINT}" = "" ]; then
  OTEL_COLLECTOR_PORT=${OTEL_COLLECTOR_PORT:-4318}
  OTEL_COLLECTOR_ENDPOINT="http://metrics-opentelemetry-collector.metrics:$OTEL_COLLECTOR_PORT"
fi

# Write addresses to file for sourcing
echo "export ETHEREUM_HOSTS=${ETHEREUM_ADDR}" >>/shared/config/service-addresses
echo "export L1_CONSENSUS_HOST_URLS=${ETHEREUM_CONSENSUS_ADDR}" >>/shared/config/service-addresses
echo "export L1_CONSENSUS_HOST_API_KEYS=${EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY}" >>/shared/config/service-addresses
echo "export L1_CONSENSUS_HOST_API_KEY_HEADERS=${EXTERNAL_ETHEREUM_CONSENSUS_HOST_API_KEY_HEADER}" >>/shared/config/service-addresses
echo "export BOOT_NODE_HOST=${BOOT_NODE_ADDR}" >>/shared/config/service-addresses
echo "export FULL_NODE_HOST=${FULL_NODE_ADDR}" >>/shared/config/service-addresses
echo "export PROVER_NODE_HOST=${PROVER_NODE_ADDR}" >>/shared/config/service-addresses
echo "export PROVER_BROKER_HOST=${PROVER_BROKER_ADDR}" >>/shared/config/service-addresses

if [ "${OTEL_COLLECTOR_ENDPOINT}" != "" ]; then
  echo "export OTEL_COLLECTOR_ENDPOINT=$OTEL_COLLECTOR_ENDPOINT" >>/shared/config/service-addresses
  echo "export OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=$OTEL_COLLECTOR_ENDPOINT/v1/logs" >>/shared/config/service-addresses
  echo "export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=$OTEL_COLLECTOR_ENDPOINT/v1/metrics" >>/shared/config/service-addresses
  echo "export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=$OTEL_COLLECTOR_ENDPOINT/v1/traces" >>/shared/config/service-addresses
fi

echo "Addresses configured:"
cat /shared/config/service-addresses
