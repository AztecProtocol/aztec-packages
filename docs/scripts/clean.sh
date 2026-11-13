#!/usr/bin/env bash
rm -rf \
    processed-docs \
    processed-docs-cache

# `yarn generate:aztec-nr-api` writes this gitignored reference for previews and `yarn start`, so it outlives them, and
# scripts/check_built_site.mts fails a production build that serves it. The same CONTEXT test as that check.
if [ "${CONTEXT:-}" = production ]; then
  docs=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd) || exit 1
  if [ -e "${docs:?}/static/aztec-nr-api/next" ]; then
    rm -rf "${docs:?}/static/aztec-nr-api/next"
    echo "Removed static/aztec-nr-api/next: production serves no dev API reference."
  fi
fi

yarn docusaurus clear
