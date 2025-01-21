#!/usr/bin/env bash
set -eu

yarn netlify deploy --dir $(pwd) --site aztec-docs-dev --prod
