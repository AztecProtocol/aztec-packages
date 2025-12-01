#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

name=$1

function cleanup {
  docker rm -f $name &>/dev/null || true
}

trap 'cleanup' SIGINT SIGTERM EXIT
cleanup

# If we're running in a terminal, run the container interactively.
# Drop into a shell if the test fails.
if [ -t 0 ]; then
  args="-ti"
  fail_shell="|| exec bash"
fi

echo "Running test $name..."
docker run --rm ${args:-} \
  -e FORCE_COLOR=1 \
  --name $name \
  --tmpfs /home/ubuntu/.npm:exec,size=2g \
  -v$(git rev-parse --show-toplevel):/home/ubuntu/aztec-packages:ro \
  -v$HOME/.bb-crs:/home/ubuntu/.bb-crs \
  -w/home/ubuntu \
  --user ubuntu:ubuntu \
  aztecprotocol/aztec-release-test \
  bash -c "
    aztec-packages/aztec-up/scripts/run_isolated_test.sh $name ${fail_shell:-}
  " &
wait $!
