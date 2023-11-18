#!/bin/bash
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
set -eu

extract_repo docs /usr/src .
cd usr/src/docs
npm install netlify-cli -g
netlify deploy
#netlify deploy --prod