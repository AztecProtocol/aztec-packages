#!/usr/bin/env bash
rm -rf \
    processed-docs \
    processed-docs-cache

# `yarn generate:aztec-nr-api` leaves this gitignored reference after previews and `yarn start`, and
# scripts/check_built_site.mts fails a production build that serves it: keep this CONTEXT test equal to that check's.
if [ "${CONTEXT:-}" = production ]; then
  docs=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd) || exit 1
  if [ -e "${docs:?}/static/aztec-nr-api/next" ]; then
    rm -rf "${docs:?}/static/aztec-nr-api/next" || exit 1
    echo "Removed static/aztec-nr-api/next: production serves no dev API reference."
  fi
fi

yarn docusaurus clear
