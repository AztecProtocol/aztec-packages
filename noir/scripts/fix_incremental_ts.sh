#!/usr/bin/env bash
# Hack to workaround incremental builds not working on mac when mounted into dev container.
# Drops the fractional part of file timestamps.
set -eu

cd $(dirname $0)/../noir-repo

# Mac doesn't set LOCAL_USER_ID as it has it's own uid alignment magic.
if [[ "$HOSTNAME" == "devbox" && -z "${LOCAL_USER_ID:-}" ]]; then
  find target -type f -print0 | xargs -0 -P $(nproc) -I {} sh -c 'touch -d @$(stat --format="%Y" {}) {}'
fi