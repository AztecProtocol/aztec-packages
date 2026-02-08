#!/usr/bin/env bash
exec "$(dirname "$0")/../../scripts/generate-package-skill.ts" "$(basename "$(dirname "$0")")"
