#!/usr/bin/env bash
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
set -eu

extract_repo docs /usr/src extracted-repo
cd extracted-repo/src/docs
npm install netlify-cli -g

DEPLOY_OUTPUT=""

# Check if we're on master
if [ "$1" = "master" ]; then
    # Deploy to production if the argument is "master"
    DEPLOY_OUTPUT=$(netlify deploy --site aztec-docs-dev --prod)
else
    # Regular deploy if the argument is not "master"
    DEPLOY_OUTPUT=$(netlify deploy --site aztec-docs-dev)
    UNIQUE_DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -o 'Unique deploy URL:.*' | awk '{print $4}')
    echo "$UNIQUE_DEPLOY_URL"
fi
