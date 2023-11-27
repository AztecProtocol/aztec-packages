#!/bin/bash

docker build -t bootstrap-build - <<EOF
FROM ubuntu:latest
RUN apt update && apt install -y git rsync docker.io
EOF

docker run -ti --rm -v/run/user/$UID/docker.sock:/var/run/docker.sock -v$(git rev-parse --show-toplevel):/repo:ro bootstrap-build /bin/bash -c "
# Checkout head.
mkdir /project && cd /project
git init
git remote add origin /repo
git fetch --depth 1 origin HEAD
git checkout FETCH_HEAD

docker build -f bootstrap/Dockerfile .
"