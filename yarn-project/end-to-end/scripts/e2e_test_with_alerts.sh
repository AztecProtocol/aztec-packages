#! /bin/bash
## Run an end to end test with alerts

# This will run an end to end test running the otel-lgtm stack (otel-collector, grafana, prometheus, tempo and loki)
# Then check the test against a set of alerts defined in the alerts.yaml file
# Note: these tests must run with METRICS enabled

# Usage: ./e2e_test_with_alerts.sh <test-name> <...extra-args>
# Example: ./e2e_test_with_alerts.sh gossip_network

set -e

test_path=$1

echo "Running otel stack"
CONTAINER_ID=$(docker run -d -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm grafana/otel-lgtm)

trap "docker stop $CONTAINER_ID" EXIT SIGINT SIGTERM

echo "Waiting for LGTM stack to be ready..."
timeout=90
while [ $timeout -gt 0 ]; do
    if docker logs $CONTAINER_ID 2>&1 | grep -q "The OpenTelemetry collector and the Grafana LGTM stack are up and running"; then
        echo "LGTM stack is ready!"
        break
    fi
    sleep 1
    ((timeout--))
done

if [ $timeout -eq 0 ]; then
    echo "Timeout waiting for LGTM stack to be ready"
    docker stop $CONTAINER_ID
    exit 1
fi

# WORKTODO(AD) make sure this is ported in ci3.3
## Pass through run the existing e2e test
docker run \
    --network host \
    -e HARDWARE_CONCURRENCY="$HARDWARE_CONCURRENCY" \
    -e FAKE_PROOFS="$FAKE_PROOFS" \
    -e METRICS_PORT="4318" \
    -e COLLECT_METRICS="true" \
    -e PULL_REQUEST="$PULL_REQUEST" \
    -e CHECK_ALERTS="true" \
    $env_args \
    --rm aztecprotocol/end-to-end:$AZTEC_DOCKER_TAG \
    "$test_path" "$@" || [ "$ignore_failures" = "true" ]

