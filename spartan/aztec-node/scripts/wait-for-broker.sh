#!/bin/bash
# Wait for the prover broker to be healthy before starting.
# This prevents noisy connection errors during startup.

if [ -z "$PROVER_BROKER_HOST" ]; then
  echo "PROVER_BROKER_HOST not set, skipping broker wait"
  exit 0
fi

echo "Waiting for broker at $PROVER_BROKER_HOST..."

until curl -sf "$PROVER_BROKER_HOST/status" > /dev/null 2>&1; do
  sleep 2
done

echo "Broker is ready"
