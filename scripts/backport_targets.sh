#!/usr/bin/env bash
# Prints the JSON array of branches a pull_request_target event should backport to.
#
# Every backport-to-<branch> label is an independent target. On merge ("closed" with MERGED=true)
# every such label is processed. A label added to an already merged PR processes only that label,
# so targets that were already backported are not cherry-picked a second time. Any other event
# prints [].
#
# Inputs (environment): EVENT_ACTION, MERGED, ADDED_LABEL, LABELS_JSON (JSON array of label names).
set -euo pipefail

prefix="backport-to-"
if [[ "${MERGED:-}" != "true" ]]; then
  echo '[]'
elif [[ "${EVENT_ACTION:-}" == "closed" ]]; then
  jq -c --arg p "$prefix" '[.[] | select(startswith($p)) | ltrimstr($p) | select(. != "")] | unique' <<< "${LABELS_JSON:-[]}"
elif [[ "${EVENT_ACTION:-}" == "labeled" && "${ADDED_LABEL:-}" == "$prefix"?* ]]; then
  jq -cn --arg l "$ADDED_LABEL" --arg p "$prefix" '[$l | ltrimstr($p)]'
else
  echo '[]'
fi
