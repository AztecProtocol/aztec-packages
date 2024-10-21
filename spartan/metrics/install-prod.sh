#!/bin/bash
set -eu

helm upgrade metrics . -n metrics --values "./values/prod.yaml" --install --create-namespace --atomic
