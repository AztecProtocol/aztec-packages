#!/usr/bin/env bash
set -eu

PR_NUMBER=$1
AZTEC_BOT_COMMENTER_GITHUB_TOKEN="$2"

if [ -n "$PR_NUMBER" ]; then
    API_URL="https://api.github.com/repos/AztecProtocol/aztec-packages/pulls/${PR_NUMBER}/files"

    echo "API URL: $API_URL"

    DOCS_CHANGED=$(curl -L \
        -H "Authorization: Bearer $AZTEC_BOT_COMMENTER_GITHUB_TOKEN" \
        "${API_URL}" |
        jq '[.[] | select(.filename | startswith("docs/"))] | length > 0')

    echo "Docs changed: $DOCS_CHANGED"

    if [ "$DOCS_CHANGED" = "false" ]; then
        echo "No docs changed, not deploying"
        exit 0
    fi
fi

# Deploy and capture exit code and output
if ! DEPLOY_OUTPUT=$(yarn netlify deploy --site aztec-docs-dev 2>&1); then
    echo "Netlify deploy failed with error:"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

# Extract and validate preview URL
DOCS_PREVIEW_URL=$(echo "$DEPLOY_OUTPUT" | grep -E "https://.*aztec-docs-dev.netlify.app" | awk '{print $4}')
if [ -z "$DOCS_PREVIEW_URL" ]; then
    echo "Failed to extract preview URL from Netlify output"
    exit 1
fi
echo "Unique deploy URL: ${DOCS_PREVIEW_URL}"

cd ../yarn-project/scripts
if [ -n "$PR_NUMBER" ]; then
    AZTEC_BOT_COMMENTER_GITHUB_TOKEN="$AZTEC_BOT_COMMENTER_GITHUB_TOKEN" \
        PR_NUMBER="$PR_NUMBER" \
        DOCS_PREVIEW_URL="$DOCS_PREVIEW_URL" \
        yarn docs-preview-comment
fi
