#!/bin/bash

REPO=$(git rev-parse --show-toplevel)

helm upgrade --install test-cl "$REPO/spartan/test-cl/" \
            --namespace eth \
            --create-namespace \
            --values "$REPO/spartan/test-cl/values.yaml"