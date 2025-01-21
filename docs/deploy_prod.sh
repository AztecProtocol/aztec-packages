#!/usr/bin/env bash
set -eu

yarn netlify deploy --dir /usr/src/docs --site aztec-docs-dev --prod
