#!/bin/bash
set -eu

cd $(dirname $0)/..

name=playground-$2
trap "docker compose -p $name down" SIGINT SIGTERM
docker compose -p $name down &> /dev/null
BROWSER=$2 docker compose -p $name up --exit-code-from=playground --abort-on-container-exit --force-recreate
