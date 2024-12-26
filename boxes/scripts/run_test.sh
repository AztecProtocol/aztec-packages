#!/bin/bash
set -eu

cd $(dirname $0)/..

name=$1-$2
trap "docker compose -p $name down" SIGINT SIGTERM
BOX=$1 BROWSER=$2 docker compose -p $name up --exit-code-from=boxes --abort-on-container-exit --force-recreate