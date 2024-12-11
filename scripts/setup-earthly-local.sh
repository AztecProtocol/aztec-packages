#!/usr/bin/env bash

EARTHLY_SCRIPT_LOCATION="$(git rev-parse --show-toplevel)/scripts/earthly-local"
echo "alias earthly=\"$EARTHLY_SCRIPT_LOCATION\"" >> ~/.zshrc