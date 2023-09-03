#!/bin/bash

# Temporarily copy the docker ignore into the core context
cp .dockerignore .. 

# Build in the root context
(cd .. && docker build . -f docs/Dockerfile)

rm ../.dockerignore