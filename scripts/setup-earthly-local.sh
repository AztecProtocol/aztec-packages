#!/usr/bin/env bash

echo "AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:-},AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY:-},AZTEC_CACHE_TOOL_IP=$(hostname -I | awk '{print $1}'),AZTEC_BOT_COMMENTER_GITHUB_TOKEN=${AZTEC_BOT_GITHUB_TOKEN:-}" > ~/.earthly-secrets
echo 'export EARTHLY_SECRET_FILES=~/.earthly-secrets' >> ~/.zshrc