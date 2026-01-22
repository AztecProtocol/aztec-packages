#!/usr/bin/env bash
set -euo pipefail

# Check we're in the test container.
if [ ! -f /aztec_release_test_container ]; then
  echo "Not running inside the aztec release test container. Exiting."
  exit 1
fi

if [ "$(whoami)" != "ubuntu" ]; then
  echo "Not running as ubuntu. Exiting."
  exit 1
fi

function retry {
  local attempts=3
  # Retries up to 3 times with 5 second intervals
  for i in $(seq 1 $attempts); do
    set +e
    ($@)
    code=$?
    set -e
    [ $code -eq 0 ] || [ $code -eq 143 ] && return 0
    [ "$i" != "$attempts" ] && sleep 5
  done

  return 1
}

function install_node {
  set -euo pipefail
  # Install required node version.
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  source ~/.nvm/nvm.sh
  node_version=$(grep node aztec-packages/aztec-up/bin/0.0.1/versions | cut -d' ' -f2)
  echo $node_version
  nvm install $node_version
  nvm alias default $node_version
}

function install_verdaccio {
  set -euo pipefail
  # Install verdaccio.
  npm i -g verdaccio
}

function start_verdaccio {
  # Create Verdaccio config (offline mode - all packages pre-cached, no proxy to npmjs).
  cat > /tmp/verdaccio-config.yaml <<EOF
  storage: /home/ubuntu/verdaccio-storage
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
  echo 'testuser:$2y$05$R1tRwE1mM3iT1dJ8hG16fOCTq7tFhFJ0IWrZ1bMCGJ6W9unQF3H3K' > /tmp/htpasswd

  # Start verdaccio local npm registry.
  verdaccio --config /tmp/verdaccio-config.yaml --listen 0.0.0.0:4873 &>/dev/null &
  while ! nc -z localhost 4873 &>/dev/null; do sleep 1; done
}

function install_aztec {
  set -euo pipefail

  # Configure npm client to use local registry.
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

  # Install aztec.
  export NO_NEW_SHELL=1
  export INSTALL_URI=file:///home/ubuntu/aztec-packages/aztec-up/bin
  if [ -t 0 ]; then
    bash_args="-i"
  else
    export NON_INTERACTIVE=1
  fi
  bash ${bash_args:-} <(curl -s $INSTALL_URI/aztec-install)

  echo "Version information:"

  bash -i -c -e '
    forge --version
    echo
    nargo --version
    echo
    echo -n "aztec version: "
    aztec --version
    echo
  '
}

# We want to use nargo from our local noir-repo build.
export NARGO=/home/ubuntu/aztec-packages/noir/noir-repo/target/release/nargo

retry install_node
source ~/.nvm/nvm.sh
retry install_verdaccio
start_verdaccio
install_aztec

# Run test. Force interactive to parse .bashrc.
bash -i aztec-packages/aztec-up/test/$1.sh
