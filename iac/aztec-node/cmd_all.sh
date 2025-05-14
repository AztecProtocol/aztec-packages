#!/bin/bash

run() {
  parallel --tag --line-buffered ./cmd.sh {} "$@" ::: eu-central ca-central ap-southeast us-west sa-east
}

case "$*" in
  txs|in_set) run "$@" | column -t ;;
  *) run "$@" ;;
esac
