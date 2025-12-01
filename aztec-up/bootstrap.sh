#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(hash_str $(cache_content_hash ^aztec-up/) $(../yarn-project/bootstrap.sh hash))

function build {
  # Create versions.json so we know what to install.
  ../bootstrap.sh versions > ./bin/versions
  echo "Versions:"
  cat ./bin/versions
  echo

  # Create Verdaccio config.
  cat > /tmp/verdaccio-config.yaml <<EOF
storage: $PWD/verdaccio-storage
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
  echo 'testuser:$2y$05$R1tRwE1mM3iT1dJ8hG16fOCTq7tFhFJ0IWrZ1bMCGJ6W9unQF3H3K' > /tmp/htpasswd

  if ! command -v verdaccio &>/dev/null; then
    npm i -g verdaccio
  fi

  rm -rf verdaccio-storage
  verdaccio --config /tmp/verdaccio-config.yaml --listen 4873 &>/dev/null &
  verdaccio_pid=$!
  trap 'kill $verdaccio_pid &>/dev/null || true' EXIT
  while ! nc -z localhost 4873 &>/dev/null; do sleep 1; done

  # Configure local npm registry.
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

  # Deploy all npm packages to local registry.
  version=$(cat ./bin/versions | grep aztec | cut -d' ' -f2)
  echo "Deploying packages to local npm registry (version: $version)..."
  {
    echo $root/barretenberg/ts
    $root/noir/bootstrap.sh get_projects
    $root/yarn-project/bootstrap.sh get_projects
  } | parallel --tag -k --line-buffer --halt now,fail=1 "dump_fail 'cd {} && deploy_npm latest $version' >/dev/null"

  # Prime the verdaccio cache by installing the packages we'll use in tests.
  # This fetches all transitive dependencies from npmjs and caches them locally.
  # Use --prefix to avoid modifying the host system's global npm packages.
  echo "Priming verdaccio cache with all dependencies..."
  npm i -g --prefix /tmp/npm-prime @aztec/aztec@$version @aztec/cli-wallet@$version @aztec/bb.js@$version
  rm -rf /tmp/npm-prime

  docker build -t aztecprotocol/aztec-release-test .
}

function test_cmds {
  for test in amm_flow bridge_and_claim basic_install counter_contract; do
    echo "$hash:TIMEOUT=15m aztec-up/scripts/run_test.sh $test"
  done
}

function test {
  echo_header "aztec-up test"
  test_cmds | filter_test_cmds | parallelize
}

function release {
  echo_header "aztec-up release"
  local version=${REF_NAME#v}
  local source_dir=./bin

  # Always create a version directory and upload files there.
  do_or_dryrun aws s3 sync $source_dir "s3://install.aztec.network/$version/"

  if [[ $(dist_tag) != "latest" ]]; then
    # Also upload to a $dist_tag directory, if not latest.
    do_or_dryrun aws s3 sync $source_dir "s3://install.aztec.network/$(dist_tag)/"
  else
    # Upload new version to root.
    do_or_dryrun aws s3 sync $source_dir s3://install.aztec.network/
  fi
}

case "$cmd" in
  "")
    build
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
