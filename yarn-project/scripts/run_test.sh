#!/bin/bash
# This runs an individual test from the dest folder.
# It's the script used by ./bootstrap.sh test-cmds.
# It means we can return a concise, easy to read, easy to run command for reproducing a test run.
# TODO: --forceExit *should not be needed*. Find out what's not being cleaned up.
source $(git rev-parse --show-toplevel)/ci3/source

test=$1
dir=${test%%/*}

if [ "${ISOLATE:-0}" -eq 1 ]; then
  # Strip leading non alpha numerics and replace / with _ for the container name.
  name=$(echo "$test" | sed 's/^[^a-zA-Z0-9]*//' | tr '/' '_')
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
    -e NODE_OPTIONS="--no-warnings --experimental-vm-modules --loader ts-node/esm" \
    $ISOLATION_IMAGE \
      node ../node_modules/.bin/jest --forceExit --runInBand $test
else
  export NODE_OPTIONS="--no-warnings --experimental-vm-modules --loader ts-node/esm"
  cd ../$dir
  node ../node_modules/.bin/jest --forceExit --runInBand $test
fi
