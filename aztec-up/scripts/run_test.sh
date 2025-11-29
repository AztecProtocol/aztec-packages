#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

name=$1

function cleanup {
  [ -f "${npm_config_userconfig:-}" ] && rm -f $npm_config_userconfig
  docker rm -f $name &>/dev/null || true
}

trap 'cleanup' SIGINT SIGTERM EXIT
cleanup

echo "Starting container with local npm registry..."
docker run --rm \
  -d \
  --name $name \
  -v$(git rev-parse --show-toplevel):/home/ubuntu/aztec-packages:ro \
  -v$HOME/.bb-crs:/home/ubuntu/.bb-crs \
  --mount type=tmpfs,target=/var/lib/docker,tmpfs-size=4g \
  -p 4873:4873 \
  aztecprotocol/aztec-release-test \
  bash -c '
    # Create Verdaccio config with NO auth required
    cat > /tmp/verdaccio-config.yaml <<EOF
storage: /tmp/verdaccio-storage
max_body_size: 1000mb

uplinks:
  npmjs:
    url: https://registry.npmjs.org/

packages:
  "@*/*":
    access: \$all
    publish: \$all
    unpublish: \$all
    proxy: npmjs

  "**":
    access: \$all
    publish: \$all
    unpublish: \$all
    proxy: npmjs

logs: { type: stdout, format: pretty, level: warn }
EOF
    echo "testuser:$2y$05$R1tRwE1mM3iT1dJ8hG16fOCTq7tFhFJ0IWrZ1bMCGJ6W9unQF3H3K" > /tmp/htpasswd
    verdaccio --config /tmp/verdaccio-config.yaml --listen 0.0.0.0:4873
  ' >/dev/null

while ! nc -z localhost 4873 &>/dev/null; do sleep 1; done

export npm_config_registry="http://localhost:4873"
export npm_config_userconfig=$(mktemp)

cat > "$npm_config_userconfig" <<'EOF'
max_body_size=1000mb
registry=http://localhost:4873/
//localhost:4873/:username=testuser
//localhost:4873/:_password=dGVzdHBhc3M=
//localhost:4873/:email=test@example.com
//localhost:4873/:always-auth=true
EOF

version=$(cat ../bin/versions | grep aztec | cut -d' ' -f2)
echo "Deploying packages to local npm registry (version: $version)..."
{
  echo $root/barretenberg/ts
  $root/noir/bootstrap.sh get_projects
  $root/yarn-project/bootstrap.sh get_projects
} | parallel --tag -k --line-buffer --halt now,fail=1 "dump_fail 'cd {} && deploy_npm latest $version' >/dev/null"

# If we're running in a terminal, run the container interactively.
# Drop into a shell if the test fails.
if [ -t 0 ]; then
  args="-ti"
  fail_shell="|| exec bash"
fi

echo "Running test $name..."
docker exec ${args:-} -w/home/ubuntu --user ubuntu:ubuntu $1 \
  bash -c "
    ./aztec-packages/aztec-up/scripts/run_isolated_test.sh $1 ${fail_shell:-}
  "
