#!/usr/bin/env bash
set -eu
export GITHUB_REPOSITORY=aztecprotocol/aztec-packages
export INPUT_AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
export INPUT_AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
export INPUT_AWS_REGION=us-east-2
export INPUT_MAX_AGE_IN_DAYS=14
export INPUT_DRY_RUN=true
export GITHUB_ENV=.github-env-mock
export GITHUB_REF=$(git rev-parse HEAD)

# npm -C .github/prune-launch-templates run build
yarn build
node ./dist/main.js
