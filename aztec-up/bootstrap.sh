#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(hash_str $(cache_content_hash ^aztec-up/) $(../ipc-runtime/bootstrap.sh hash) $(../wsdb/bootstrap.sh hash) $(../barretenberg/ts/bootstrap.sh hash) $(../yarn-project/bootstrap.sh hash))

# Bare aliases ("nightly", "latest") resolve to this major version.
DEFAULT_MAJOR_VERSION=${AZTEC_TOOLCHAIN_DEFAULT_MAJOR_VERSION:-4}

function wsdb_package_dirs {
  for package_dir in "$root"/wsdb/ts/packages/*; do
    [ -d "$package_dir" ] && echo "$package_dir"
  done
  echo "$root/wsdb/ts"
}

function barretenberg_ts_package_dirs {
  "$root"/barretenberg/ts/bootstrap.sh get_projects
}

function build {
  # Noop if user doesn't have docker.
  if ! command -v docker &>/dev/null; then
    echo "Docker not installed. Skipping..."
    return
  fi

  # Create versions.json so we know what to install.
  ../bootstrap.sh versions > ./bin/0.0.1/versions
  echo "Versions:"
  cat ./bin/0.0.1/versions
  echo

  # Create Verdaccio config.
  # publish.allow_offline lets verdaccio accept publishes when the npmjs
  # uplink is briefly unreachable, instead of returning 503. We never want
  # the upstream existence check to gate these local fake-publishes.
  cat > /tmp/verdaccio-config.yaml <<EOF
storage: $PWD/verdaccio-storage
max_body_size: 1000mb

uplinks:
  npmjs:
    url: https://registry.npmjs.org/

publish:
  allow_offline: true

packages:
  # @aztec/viem is a third-party fork published to npm, not built locally.
  # Match it before @aztec/* so it falls through to the npmjs uplink.
  "@aztec/viem":
    access: \$all
    publish: \$all
    unpublish: \$all
    proxy: npmjs

  "@aztec/*":
    access: \$all
    publish: \$all
    unpublish: \$all

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
    # Install to a local prefix to avoid requiring root for global npm install.
    npm i -g --prefix /tmp/verdaccio-pkg verdaccio
    export PATH="/tmp/verdaccio-pkg/bin:$PATH"
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
      echo $root/ipc-runtime/ts
      barretenberg_ts_package_dirs
      wsdb_package_dirs
      # l1-artifacts lives under l1-contracts, so it isn't enumerated by yarn-project's get_projects;
      # publish it explicitly or @aztec/aztec's portal dependency can't resolve from the local registry.
      echo $root/l1-contracts/l1-artifacts
      $root/noir/bootstrap.sh get_projects
      $root/yarn-project/bootstrap.sh get_projects
    } | DRY_RUN= parallel --tag --line-buffer --halt now,fail=1 "retry 'cd {} && dump_fail \"deploy_npm $version\" >/dev/null'"

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
  for test in amm_flow bridge_and_claim basic_install counter_contract default_scaffold no_shadow_user_bins; do
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
  # e.g. "nightly", or "latest" for bare releases
  local dist_tag=$(dist_tag)
  # e.g. "4" from v4.1.0-nightly.20260319
  local major=$(semver major $REF_NAME)

  # Upload each file in bin/0.0.1/, replacing VERSION= lines with the release version.
  for file in bin/0.0.1/*; do
    sed "s/^VERSION=.*/VERSION=$version/" "$file" | \
      do_or_dryrun aws s3 cp - "s3://install.aztec.network/$version/$(basename $file)"
  done

  # Update versioned alias (e.g. v4-nightly, v5-latest).
  do_or_dryrun aws s3 cp - "s3://install.aztec.network/aliases/v${major}-${dist_tag}" <<< "$version"

  # Bare alias (e.g. "nightly") should always resolve to the default major.
  if [ "$major" = "$DEFAULT_MAJOR_VERSION" ]; then
    do_or_dryrun aws s3 cp - "s3://install.aztec.network/aliases/$dist_tag" <<< "$version"
  fi
}

# This is not done by CI.
# It's a manual process, as updating the root installer and alias index requires careful consideration.
function release_root_installer {
    # Upload root installer assets: aztec-install (with VERSION defaulting to latest), aztec-up, and banner files.
    sed "s/^VERSION=\${VERSION:-.*}/VERSION=\${VERSION:-latest}/" bin/0.0.1/aztec-install | \
      do_or_dryrun aws s3 cp - "s3://install.aztec.network/aztec-install"
    do_or_dryrun aws s3 cp bin/0.0.1/aztec-up "s3://install.aztec.network/aztec-up"
    do_or_dryrun aws s3 cp bin/0.0.1/aztec-banner "s3://install.aztec.network/aztec-banner"
    do_or_dryrun aws s3 cp bin/0.0.1/aztec-banner-truecolor "s3://install.aztec.network/aztec-banner-truecolor"

    # Update alias list.
    do_or_dryrun aws s3 cp bin/aliases/index "s3://install.aztec.network/aliases/index"
}

function prep_test_mac {
  local verdaccio_port=4873
  local http_port=4874

  # Ensure we've cross-compiled bb for macos. Normally this is only done on releases.
  ../barretenberg/cpp/bootstrap.sh build_cross amd64-macos true
  ../barretenberg/ts/bootstrap.sh cross_copy_bb_js amd64-macos
  ../barretenberg/ts/bootstrap.sh cross_copy_bb_avm_sim amd64-macos

  # Ensure build artifacts exist.
  if [ ! -f ./bin/0.0.1/versions ] || [ ! -d ./verdaccio-storage ]; then
    echo "Build artifacts missing. Running build first..."
    build
  fi

  # Cleanup background processes on exit.
  # Note: can't use local - the trap fires after function scope is gone.
  _bg_pids=()
  trap 'kill "${_bg_pids[@]}" &>/dev/null || true' EXIT

  # Start Verdaccio in offline mode (no uplinks), bound to all interfaces.
  cat > /tmp/verdaccio-mac-test.yaml <<EOF
storage: $PWD/verdaccio-storage
max_body_size: 1000mb

packages:
  "@*/*":
    access: \$all
    publish: \$all
    unpublish: \$all

  "**":
    access: \$all
    publish: \$all
    unpublish: \$all

logs: { type: stdout, format: pretty, level: warn }
EOF

  verdaccio --config /tmp/verdaccio-mac-test.yaml --listen 0.0.0.0:$verdaccio_port &>/dev/null &
  _bg_pids+=($!)
  while ! nc -z localhost $verdaccio_port &>/dev/null; do sleep 1; done
  echo "Verdaccio running on 0.0.0.0:$verdaccio_port"

  # Serve bin/ directory over HTTP to mimic S3-hosted install scripts.
  python3 -m http.server $http_port --directory ./bin --bind 0.0.0.0 &>/dev/null &
  _bg_pids+=($!)
  while ! nc -z localhost $http_port &>/dev/null; do sleep 1; done
  echo "HTTP server running on 0.0.0.0:$http_port (serving ./bin/)"
}

function install_on_mac_vm {
  local mac_name="${1:?Mac vm name (e.g. 14)}"
  local host_ip="${HOST_IP:-172.20.0.1}"
  local verdaccio_port=4873
  local http_port=4874

  # Run install on the Mac VM via SSH.
  echo "Running install on Mac VM ($mac_name)..."
  /mnt/user-data/macos/ssh.sh $mac_name zsh -l <<REMOTE_EOF
    set -euo pipefail

    # Clean previous install.
    rm -rf ~/.aztec

    # Point npm at local Verdaccio and scripts at local HTTP server.
    export npm_config_registry=http://$host_ip:$verdaccio_port
    export INSTALL_URI=http://$host_ip:$http_port
    export INFRA_VERSION=0.0.1
    export NO_NEW_SHELL=1

    touch \$HOME/.zshrc
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
    . "\$HOME/.nvm/nvm.sh"

    echo
    echo "Running aztec install script..."
    bash <(curl -sL \$INSTALL_URI/0.0.1/aztec-install)

    # Fake fresh shell.
    export PATH="\$HOME/.aztec/current/bin:\$HOME/.aztec/current/node_modules/.bin:\$HOME/.aztec/bin:\$PATH"
    . "\$HOME/.nvm/nvm.sh"

    # Verify installation.
    aztec-nargo --version
    aztec-bb --version
    aztec --version
REMOTE_EOF
}

function launch_and_install_on_mac_vm {
  set -euo pipefail
  local version="$1"
  local name="aztec-up-test-$version"
  /mnt/user-data/macos/launch_vm.sh $version "" $name
  local ip=$(docker inspect -f '{{ .NetworkSettings.Networks.bridge.IPAddress }}' macos-$name)
  echo "Waiting for Mac VM ($name) to be accessible at $ip..."
  while ! nc -z $ip 22 &>/dev/null; do sleep 0.5; done
  install_on_mac_vm $name
  docker stop macos-$name
}

export -f install_on_mac_vm launch_and_install_on_mac_vm

# Assumes a macos vm is already running.
# Starts services, and runs install script on the mac vm via ssh.
function test_on_mac_vm {
  local mac_name="${1:?Mac vm name (e.g. 14)}"
  echo_header "aztec-up test_on_mac_vm"
  prep_test_mac
  install_on_mac_vm $mac_name
}

function test_mac {
  local mac_name="${1:?Mac vm name (e.g. 14)}"
  echo_header "aztec-up test_mac"
  prep_test_mac
  launch_and_install_on_mac_vm $mac_name
}

# Starts services, launches a mac vm for each version and runs install script via ssh.
function test_macs {
  echo_header "aztec-up test_macs"
  prep_test_mac
  LIVE_LOGGING=1 PASS_LOG=1 parallelize < <(for mac in 14 15 26; do echo "fake_hash launch_and_install_on_mac_vm $mac"; done) | cat
}

case "$cmd" in
  "")
    build
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
