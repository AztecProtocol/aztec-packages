#!/usr/bin/env bash
set -e

export INPUT_AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:-}
export INPUT_AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY:-}
export INPUT_AWS_REGION=us-east-2
export INPUT_MAX_AGE_IN_DAYS=14
export INPUT_DRY_RUN=true

# if aws cred are not set, attempt to retrieve them from ~/.aws/credentials
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
  if [ -f ~/.aws/credentials ]; then
    export INPUT_AWS_ACCESS_KEY_ID=$(aws configure get default.aws_access_key_id)
    export INPUT_AWS_SECRET_ACCESS_KEY=$(aws configure get default.aws_secret_access_key)
  fi
fi

# npm -C .github/prune-launch-templates run build
yarn build
node ./dist/index.js