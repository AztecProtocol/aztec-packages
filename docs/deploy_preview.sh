#!/usr/bin/env bash
set -eu
source $(git rev-parse --show-toplevel)/ci3/source

PR_NUMBER=$1
AZTEC_BOT_COMMENTER_GITHUB_TOKEN="$2"

# Regular deploy if the argument is not "master" and docs changed
DEPLOY_OUTPUT=$(yarn netlify deploy --site aztec-docs-dev)
DOCS_PREVIEW_URL=$(echo "$DEPLOY_OUTPUT" | grep -E "https://.*aztec-docs-dev.netlify.app" | awk '{print $4}')
echo "Unique deploy URL: $DOCS_PREVIEW_URL"

cd ../yarn-project/scripts
if [ -n "$PR_NUMBER" ]; then
    AZTEC_BOT_COMMENTER_GITHUB_TOKEN=$AZTEC_BOT_COMMENTER_GITHUB_TOKEN PR_NUMBER=$PR_NUMBER DOCS_PREVIEW_URL=$DOCS_PREVIEW_URL yarn docs-preview-comment
fi
