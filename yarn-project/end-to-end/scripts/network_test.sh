#!/bin/bash

# Usage: ./network_test.sh <test>
# If <test> == "interactive" the 'docker run' drops into a shell where you can e.g. edit our test file
# Optional environment variables:
#   END_TO_END_DOCKER_TAG (default: AZTEC_DOCKER_TAG, if not set then current git commit)
# Required environment variables passed to helm_deploy.sh:
#   NAMESPACE
# Optional environment variables passed to helm_deploy.sh:
#   VALUES_FILE (default: "default.yaml")
#   CHAOS_VALUES (default: "")
#   FRESH_INSTALL (default: "false")

set -eux

# Main positional parameter
TEST="$1"

AZTEC_DOCKER_TAG=${AZTEC_DOCKER_TAG:-$(git rev-parse HEAD)}
END_TO_END_DOCKER_TAG=${END_TO_END_DOCKER_TAG:-$AZTEC_DOCKER_TAG}

# Ensure our aztec helm chart is deployed
$(git rev-parse --show-toplevel)/yarn-project/end-to-end/scripts/helm_deploy.sh

function k8s_pxe_port_forward() {
  # Clear any existing port forward
  ps aux | grep "kubectl port-forward" | grep 9081 | awk '{print $2}' | xargs kill || true
  # tunnel in to get access directly to our PXE service in k8s
  kubectl port-forward -n "$NAMESPACE" svc/spartan-aztec-network-pxe 9080:8080 || true
}

# Make sure the port forwarding outlives the script
nohup k8s_pxe_port_forward >/dev/null 2>/dev/null &

# run our test in the host network namespace (so we can access the above with localhost)
if [ "$TEST" = interactive ] ; then
  docker run --rm -it --network=host \
    -e SCENARIO=default \
    -e PXE_URL=http://localhost:9080 \
    -e DEBUG="aztec:*" \
    -e LOG_LEVEL=debug \
    -e LOG_JSON=1 \
    --entrypoint /bin/sh \
    aztecprotocol/end-to-end:$END_TO_END_DOCKER_TAG
elif ! [ "$TEST" = none ] ; then
  if ! docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -q "aztecprotocol/aztec:$END_TO_END_DOCKER_TAG"; then
    echo "Docker images not found. They need to be built with 'earthly ./yarn-project/+export-end-to-end'."
    exit 1
  fi
  docker run --rm --network=host \
    -e SCENARIO=default \
    -e PXE_URL=http://localhost:9080 \
    -e DEBUG="aztec:*" \
    -e LOG_LEVEL=debug \
    -e LOG_JSON=1 \
    aztecprotocol/end-to-end:$END_TO_END_DOCKER_TAG $TEST
fi