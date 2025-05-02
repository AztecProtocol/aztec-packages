#!/usr/bin/env bash

NAMESPACE="$1"
APP="$2"
CONFIG="$3"
STATEFULSET_NAME="$NAMESPACE-aztec-network-$APP"
ADMIN_PORT=8880

cleanup() {
    if [ ! -z "$PF_PID" ]; then
        echo "Cleaning up port-forward process $PF_PID"
        kill $PF_PID 2>/dev/null
        wait $PF_PID 2>/dev/null
    fi
}

trap cleanup EXIT

echo "Getting pods from StatefulSet: $STATEFULSET_NAME in namespace: $NAMESPACE"
PODS=$(kubectl get pods -n $NAMESPACE -l app=$APP -o jsonpath='{.items[*].metadata.name}')

if [ -z "$PODS" ]; then
    echo "No pods found for StatefulSet: $STATEFULSET_NAME"
    exit 1
fi

for POD in $PODS; do
    echo "----------------------------------------"
    echo "Updating config of: $POD"

    echo "Starting port-forward for $POD on port $PORT"
    kubectl port-forward -n $NAMESPACE $POD $ADMIN_PORT:$ADMIN_PORT &
    PF_PID=$!

    echo "Waiting for port-forward to be ready..."
    sleep 2

    if ! ps -p $PF_PID > /dev/null; then
        echo "Port-forward failed for pod $POD"
        continue
    fi

    curl -X POST --data "{\"method\": \"nodeAdmin_setConfig\",\"params\":[$CONFIG]}" http://127.0.0.1:$ADMIN_PORT

    echo "Stopping port-forward for $POD"
    kill $PF_PID 2>/dev/null
    wait $PF_PID 2>/dev/null

    sleep 1
done
