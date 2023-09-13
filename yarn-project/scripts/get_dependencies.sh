#!/bin/bash
set -eu

REPO=$1

cd "$(dirname "$0")"

echo yarn-project-base
jq -r ".dependencies | keys | .[] | select(startswith(\"@aztec/\")) | ltrimstr(\"@aztec/\")" ../$REPO/package.json