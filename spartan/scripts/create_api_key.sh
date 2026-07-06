#!/usr/bin/env bash

set -euo pipefail

API_KEY_NAME="${1:-}"
CLIENT_NAME="${2:-}"

function die {
  echo $@ >&2
  exit 1
}

if [[ -z "$API_KEY_NAME" ]]; then
  die "Missing API key secret name"
fi

if [[ -z "$CLIENT_NAME" ]]; then
  die "Missing client name."
fi

LAST="$(gcloud secrets list --filter "$API_KEY_NAME-client" --sort-by "~createTime" --format=json | jq -r ".[0].name")"
if [[ "$LAST" == "null" ]]; then 
  openssl rand -hex 16 | tr -d '\n' | gcloud secrets create "${API_KEY_NAME}-client1" --data-file=- --set-annotations="client_name=$CLIENT_NAME"
else

  if [[ "$LAST" =~ -client([0-9]+)$ ]]; then
    PREV="${BASH_REMATCH[1]}"
    NEXT="$((10#$PREV + 1))"
  else
    die "Could not parse client number from: $LAST"
  fi

  openssl rand -hex 16 | tr -d '\n' | gcloud secrets create "${API_KEY_NAME}-client${NEXT}" --data-file=- --set-annotations="client_name=$CLIENT_NAME"
fi
