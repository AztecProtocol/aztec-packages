#!/bin/bash

function read_values_file() {
  local key="$1"

  value=$(yq -r ".$key" "$VALUES_PATH")
  if [ -z "$value" ] || [ "$value" = "null" ]; then
    value=$(yq -r ".$key" "$DEFAULT_VALUES_PATH")
  fi
  echo "$value"
}

