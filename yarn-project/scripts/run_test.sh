#!/bin/bash
# This runs an individual test from the dest folder.
# It's the script used by ./bootstrap.sh test-cmds.
# It means we can return a concise, easy to read, easy to run command for reproducing a test run.
# TODO: --forceExit *should not be needed*. Find out what's not being cleaned up.
set -eu

path=$1
dir=${path%%/*}
test=${path#*dest/}

if [ "${ISOLATE:-0}" -eq 1 ]; then
  # Strip leading non alpha numerics and replace / with _ for the container name.
  name=$(echo "$path" | sed 's/^[^a-zA-Z0-9]*//' | tr '/' '_')
  [ "${UNNAMED:-0}" -eq 0 ] && name_arg="--name $name"
  trap 'docker kill $name &>/dev/null; docker rm $name &>/dev/null' SIGINT SIGTERM
  docker run --rm \
    ${name_arg:-} \
    --cpus=2 \
    --memory 4g \
    -v$(git rev-parse --show-toplevel):/root/aztec-packages \
    -v$HOME/.bb-crs:/root/.bb-crs \
    --mount type=tmpfs,target=/tmp,tmpfs-size=1g \
    --workdir /root/aztec-packages/yarn-project/$dir \
    -e NODE_OPTIONS="--no-warnings --experimental-vm-modules" \
    aztecprotocol/build:3.0 \
      node ../node_modules/.bin/jest --forceExit --runInBand --testRegex '\.test\.js$' --rootDir dest $test
else
  export NODE_OPTIONS="--no-warnings --experimental-vm-modules"
  cd $(dirname $0)/../$dir
  node ../node_modules/.bin/jest --forceExit --runInBand --testRegex '\.test\.js$' --rootDir dest $test
fi