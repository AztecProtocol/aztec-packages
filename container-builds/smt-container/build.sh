#!/usr/bin/env bash

image_name="smt-build-static"
COMMIT="f3ff6161155ba5e07d14ea1c52a218494eb8bb96"
docker build -t "$image_name" --target reuse --build-arg COMMIT="$COMMIT" src
