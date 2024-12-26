#!/bin/bash
set -eu

cd $(dirname $0)/..

BOX=$1 BROWSER=$2 denoise docker compose -p $1-$2 up --exit-code-from=boxes --abort-on-container-exit --force-recreate