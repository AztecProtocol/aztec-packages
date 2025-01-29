#!/bin/bash
# This runs a network in KIND or locally.
# It's the script used by ./bootstrap.sh test-cmds.
source $(git rev-parse --show-toplevel)/ci3/source

cmd=$1
if [ "$cmd" = kind ]; then
  shift
  ./test_kind.sh "$@"
elif [ "$cmd" = local ]; then
  shift
  # Isolate in docker to not overlap our network stack.
  # For local debugging, it is recommended to not pass the -i (interleave flag)
  # and not isolate, to have a nice tmux splits experience that can be iterated on easily (e.g. close a tab )
  name=local-network-$(hash_str "$*")
  [ "${UNNAMED:-0}" -eq 0 ] && name_arg="--name $name"
  trap 'docker rm -f $name &>/dev/null' SIGINT SIGTERM
  docker rm -f $name &>/dev/null || true
  # TODO: possibly compute --cpus and --memory flags
  docker run --rm \
    ${name_arg:-} \
    -v$(git rev-parse --show-toplevel):/root/aztec-packages \
    -v$HOME/.bb-crs:/root/.bb-crs \
    --mount type=tmpfs,target=/tmp,tmpfs-size=1g \
    --workdir /root/aztec-packages \
    -e FORCE_COLOR=true \
    aztecprotocol/build:3.0 \
      ../scripts/run_native_testnet.sh -i $@
fi
