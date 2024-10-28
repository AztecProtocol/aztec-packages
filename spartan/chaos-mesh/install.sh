#!/bin/bash

# Install chaos-mesh
helm repo add chaos-mesh https://charts.chaos-mesh.org
helm dependency update

helm upgrade chaos . -n chaos-mesh --install --create-namespace --atomic