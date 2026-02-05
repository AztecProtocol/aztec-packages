#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(hash_str $(cache_content_hash ^aztec-up/) $(../yarn-project/bootstrap.sh hash))

function build {
  # Create versions.json so we know what to install.
  ../bootstrap.sh versions > ./bin/0.0.1/versions
  echo "Versions:"
  cat ./bin/0.0.1/versions
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

  local base_hash=$(cache_content_hash ^aztec-up/Dockerfile.base)
  if ! cache_download aztec-up-test-base-image-$base_hash.zst; then
    docker build -t aztecprotocol/aztec-up-test-base -f Dockerfile.base .
    docker save aztecprotocol/aztec-up-test-base:latest > aztec-up-test-base-image
    cache_upload aztec-up-test-base-image-$base_hash.zst aztec-up-test-base-image
  else
    docker load < aztec-up-test-base-image
  fi

  if ! cache_download aztec-up-test-image-$hash.zst; then
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
    version=0.0.1
    # TODO(AD): we have kludged a retry here. a local NPM install ought to be robust enough not to.
    echo "Deploying packages to local npm registry (version: $version)..."
    {
      echo $root/barretenberg/ts
      $root/noir/bootstrap.sh get_projects
      $root/yarn-project/bootstrap.sh get_projects
    } | parallel --tag -k --line-buffer --halt now,fail=1 "retry 'cd {} && dump_fail \"deploy_npm latest $version\"'"

    # Prime the verdaccio cache by installing the packages we'll use in tests.
    # This fetches all transitive dependencies from npmjs and caches them locally.
    # Use --prefix to avoid modifying the host system's global npm packages.
    echo "Priming verdaccio cache with all dependencies..."
    retry "npm i -g --prefix /tmp/npm-prime @aztec/aztec@$version @aztec/cli-wallet@$version @aztec/bb.js@$version"
    rm -rf /tmp/npm-prime

    docker build -t aztecprotocol/aztec-up-test .
    docker save aztecprotocol/aztec-up-test:latest > aztec-up-test-image

    cache_upload aztec-up-test-image-$hash.zst aztec-up-test-image
  else
    docker load < aztec-up-test-image
  fi
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

  # Upload version-specific files to version directory.
  do_or_dryrun aws s3 cp bin/0.0.1/install "s3://install.aztec.network/$version/install"
  do_or_dryrun aws s3 cp bin/0.0.1/versions "s3://install.aztec.network/$version/versions"

  # Upload root installer files to the version directory, which can be useful for testing.
  do_or_dryrun aws s3 cp bin/aztec-install "s3://install.aztec.network/$version/aztec-install"
  do_or_dryrun aws s3 cp bin/aztec-up "s3://install.aztec.network/$version/aztec-up"

  # Update alias to point to new version.
  # This has real impact outside of the version fence. i.e. if it's nightly dist tag, it affects nightly installs.
  do_or_dryrun aws s3 cp - "s3://install.aztec.network/aliases/$(dist_tag)" <<< "$version"
}

# This is not done by CI.
# It's a manual process, as updating the root installer and alias index requires careful consideration.
function release_aztec_up {
    # Update root scripts.
    do_or_dryrun aws s3 cp bin/aztec-install "s3://install.aztec.network/aztec-install"
    do_or_dryrun aws s3 cp bin/aztec-up "s3://install.aztec.network/aztec-up"

    # Update alias list.
    do_or_dryrun aws s3 cp bin/aliases/index "s3://install.aztec.network/aliases/index"
}

case "$cmd" in
  "")
    build
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
