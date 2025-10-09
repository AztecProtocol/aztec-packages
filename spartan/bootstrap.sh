#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(hash_str $(cache_content_hash .rebuild_patterns) $(../yarn-project/bootstrap.sh hash))

dump_fail "flock scripts/logs/install_deps.lock retry scripts/install_deps.sh >&2"

source ./scripts/source_env_basic.sh
source ./scripts/source_network_env.sh
source ./scripts/gcp_auth.sh

function build {
  denoise "helm lint ./aztec-network/"
  denoise ./spartan/scripts/check_env_vars.sh
}

function network_shaping {
  namespace="$1"
  chaos_values="$2"
  if ! kubectl get service chaos-daemon -n chaos-mesh &>/dev/null; then
    echo "Please set up chaos-mesh first. You can do this by running spartan/bootstrap.sh chaos-mesh"
    exit 1
  fi

  echo "Deploying Aztec Chaos Scenarios..."
  if ! helm upgrade --install aztec-chaos-scenarios aztec-chaos-scenarios \
    --namespace chaos-mesh \
    --values "aztec-chaos-scenarios/values/$chaos_values" \
    --set global.targetNamespace="$namespace" \
    --wait \
    --timeout=5m; then
    echo "Error: failed to deploy Aztec Chaos Scenarios!"
    return 1
  fi
  echo "Aztec Chaos Scenarios applied successfully"
  return 0
}

function gke {
  # For GKE access
  if ! command -v gcloud &> /dev/null; then
    if [ -f /etc/os-release ] && grep -qi "Ubuntu" /etc/os-release; then
      sudo apt update
      sudo apt install -y apt-transport-https ca-certificates gnupg curl
      sudo rm -f /usr/share/keyrings/cloud.google.gpg && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
      echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
      sudo apt install -y google-cloud-cli
      sudo apt install google-cloud-cli-gke-gcloud-auth-plugin
      echo "Now you can run 'gcloud init'. Exiting with 1 as this is a necessary step."
    else
      echo "gcloud not found. This is needed for GKE kubernetes usage." >&2
      echo "If needed, install glcoud and do 'gcloud components install gke-gcloud-auth-plugin', then 'gcloud init'" >&2
    fi
    exit 1
  fi
}

function test_cmds {
  # the existing test flow is deprecated.
  # we are moving things to use the same deployment flow as the scenario/staging networks.
  :
}

function network_test_cmds {
  # a github runner has a maximum of 6 hours.
  # currently, we allocate just shy of one hour for each test, so we can have at most 6 tests.
  # If we have more tests, we can reduce the epoch/slot duration in the tests,
  # or parallelize somehow. It's just something to be aware of if you are adding new tests here.
  local prefix="disabled-cache:CPUS=10:MEM=16g:TIMEOUT=55m"
  local run_test_script="yarn-project/end-to-end/scripts/run_test.sh"
  echo $prefix $run_test_script simple src/spartan/smoke.test.ts
  echo $prefix $run_test_script simple src/spartan/transfer.test.ts
  echo $prefix $run_test_script simple src/spartan/slash_inactivity.test.ts
}

function single_test {
  local test_file="$1"
  $root/yarn-project/end-to-end/scripts/run_test.sh simple $test_file
}

function start_env {
  if [ "$CI_NIGHTLY" -eq 1 ] && [ "$(arch)" != "arm64" ]; then
    echo "Skipping start_env for nightly while we migrate to use the same deployment flow as the scenario/staging networks."
  fi
}

function stop_env {
  if [ "$CI_NIGHTLY" -eq 1 ] && [ "$(arch)" != "arm64" ]; then
    echo "Skipping stop_env for nightly while we migrate to use the same deployment flow as the scenario/staging networks."
  fi
}


function test {
  echo_header "spartan test (deprecated)"
  # the existing test flow is deprecated.
  # we are moving things to use the same deployment flow as the scenario/staging networks.
  :
}

function network_tests {
  echo_header "spartan scenario test"

  # no parallelize here as we want to run the tests sequentially
  export SCENARIO_TESTS=1
  network_test_cmds | filter_test_cmds | parallelize 1
}

function ensure_eth_balances {
  amount="$1"
  # if ETHEREUM_HOST is not set, use the first RPC URL
  if [ -z "${ETHEREUM_HOST:-}" ]; then
    # if using kind, prefer localhost RPC. Requires user to port-forward 8545.
    if [[ "${CLUSTER:-kind}" == "kind" ]]; then
      export ETHEREUM_HOST="http://localhost:8545"
    else
      export ETHEREUM_HOST=$(echo "${ETHEREUM_RPC_URLS}" | jq -r '.[0]')
    fi
  fi
  ./scripts/ensure_eth_balances.sh "$ETHEREUM_HOST" "$FUNDING_PRIVATE_KEY" "$LABS_INFRA_MNEMONIC" "$LABS_INFRA_INDICES" "$amount"
}

case "$cmd" in
  "")
    # do nothing but the install_deps.sh above
    ;;
  "ensure_eth_balances")
    shift
    env_file="$1"
    amount="$2"

    # First pass: source environment for basic variables like CLUSTER (skip GCP secret processing)
    source_env_basic "$env_file"

    # Perform GCP auth (needs CLUSTER and other basic vars)
    gcp_auth

    # Second pass: source environment with GCP secret processing
    source_network_env "$env_file"

    ensure_eth_balances "$amount"
    ;;
  "ensure_funded_environment")
    shift
    env_file="$1"
    low_watermark="${2:-0.5}"
    high_watermark="${3:-1.0}"

    ./scripts/ensure_funded_environment.sh "$env_file" "$FUNDING_PRIVATE_KEY" "$low_watermark" "$high_watermark"
    ;;
  "network_deploy")
    shift
    env_file="$1"

    # Run the network deploy script
    ./scripts/network_deploy.sh "$env_file"

    if [[ "${RUN_TESTS:-}" == "true" ]]; then
      echo "Running tests"
      network_tests
    fi
    ;;
  "single_test")
    shift
    env_file="$1"
    test_file="$2"
    source_network_env $env_file

    gcp_auth
    single_test $test_file
    ;;

  "network_tests")
    shift
    env_file="$1"
    source_network_env $env_file

    gcp_auth
    network_tests
    ;;
  "kind")
    if ! kubectl config get-clusters | grep -q "^kind-kind$" || ! docker ps | grep -q "kind-control-plane"; then
      # Sometimes, kubectl does not have our kind context yet kind registers it as existing
      # Ensure our context exists in kubectl
      # As well if kind-control-plane has been killed, just recreate the cluster
      flock scripts/logs/kind-boot.lock bash -c "kind delete cluster; kind create cluster --config scripts/kind-config.yaml"
      # Patch the kubeconfig to replace any invalid API server address (0.0.0.0) with 127.0.0.1
      sed -i 's/https:\/\/0\.0\.0\.0:/https:\/\/127.0.0.1:/' "$HOME/.kube/config"

      # Patch DNS if KIND_FIX_DNS=true
      ./scripts/patch_dns.sh
    fi
    kubectl config use-context kind-kind >/dev/null || true
    docker update --restart=no kind-control-plane >/dev/null || true
    ;;
  "chaos-mesh")
    chaos-mesh/install.sh
    ;;
  "metrics-kind")
    metrics/install-kind.sh
    ;;
  "metrics-prod")
    metrics/install-prod.sh
    ;;
  "network-shaping")
    shift
    namespace="$1"
    chaos_values="$2"
    if network_shaping "$namespace" "$chaos_values"; then
      exit
    fi
    # If we are unable to apply network shaping, as we cannot change existing chaos configurations, then delete existing configurations and try again
    echo "Deleting existing network chaos experiments..."
    kubectl delete networkchaos --all --all-namespaces
    network_shaping "$namespace" "$chaos_values"
    ;;
  "hash")
    echo $hash
    ;;
  test|test_cmds|gke|build|start_env|stop_env|gcp_auth)
    $cmd
    ;;
  "test-kind-smoke")
    OVERRIDES="telemetry.enabled=false,bot.enabled=false" \
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false \
      ./scripts/test_k8s.sh kind src/spartan/smoke.test.ts 1-validators.yaml smoke${NAME_POSTFIX:-}
    ;;
  "test-kind-4epochs")
    # TODO(#12163) reenable bot once not conflicting with transfer
    OVERRIDES="bot.enabled=false" \
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false \
      ./scripts/test_k8s.sh kind src/spartan/4epochs.test.ts ci.yaml four-epochs${NAME_POSTFIX:-}
    ;;
  "test-kind-4epochs-sepolia")
    OVERRIDES="bot.enabled=false" \
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false SEPOLIA_RUN=true \
      ./scripts/test_k8s.sh kind src/spartan/4epochs.test.ts ci-sepolia.yaml four-epochs${NAME_POSTFIX:-}
    ;;
  "test-kind-proving")
    OVERRIDES="bot.enabled=false" \
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false \
      ./scripts/test_k8s.sh kind src/spartan/proving.test.ts ci.yaml proving${NAME_POSTFIX:-}
    ;;
  "test-kind-transfer")
    # TODO(#12163) reenable bot once not conflicting with transfer
    OVERRIDES="blobSink.enabled=true,bot.enabled=false" \
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false \
      ./scripts/test_k8s.sh kind src/spartan/transfer.test.ts ci.yaml transfer${NAME_POSTFIX:-}
    ;;
  "test-kind-1tps")
    OVERRIDES="blobSink.enabled=true,bot.enabled=false" \
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false RESOURCES_FILE=gcloud-1tps-sim.yaml \
      ./scripts/test_k8s.sh kind src/spartan/1tps.test.ts ci-1tps.yaml one-tps${NAME_POSTFIX:-}
    ;;
  "test-kind-10tps-10%-drop")
    OVERRIDES="telemetry.enabled=false,blobSink.enabled=true,bot.enabled=false,validator.p2p.dropTransactions=true,validator.p2p.dropTransactionsProbability=0.1" \
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false \
    ./scripts/test_k8s.sh kind src/spartan/n_tps.test.ts ci-1tps.yaml ten-tps${NAME_POSTFIX:-}
  ;;
  "test-kind-10tps-30%-drop")
    OVERRIDES="telemetry.enabled=false,blobSink.enabled=true,bot.enabled=false,validator.p2p.dropTransactions=true,validator.p2p.dropTransactionsProbability=0.3" \
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false \
    ./scripts/test_k8s.sh kind src/spartan/n_tps.test.ts ci-tx-drop.yaml ten-tps${NAME_POSTFIX:-}
  ;;
  "test-kind-10tps-50%-drop")
    OVERRIDES="telemetry.enabled=false,blobSink.enabled=true,bot.enabled=false,validator.p2p.dropTransactions=true,validator.p2p.dropTransactionsProbability=0.5" \
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false \
    ./scripts/test_k8s.sh kind src/spartan/n_tps.test.ts ci-tx-drop.yaml ten-tps${NAME_POSTFIX:-}
  ;;
  "test-kind-upgrade-rollup-version")
    OVERRIDES="bot.enabled=false,ethereum.acceleratedTestDeployments=false" \
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false \
      ./scripts/test_k8s.sh kind src/spartan/upgrade_rollup_version.test.ts ci.yaml upgrade-rollup-version${NAME_POSTFIX:-}
    ;;
  "test-prod-deployment")
    FRESH_INSTALL=false INSTALL_METRICS=false ./scripts/test_prod_deployment.sh
    ;;
  "test-cli-upgrade")
    OVERRIDES="telemetry.enabled=false" \
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false \
      ./scripts/test_k8s.sh kind src/spartan/upgrade_via_cli.test.ts 1-validators.yaml upgrade-via-cli${NAME_POSTFIX:-}
    ;;
  "test-gke-transfer")
    shift
    execution_client="$1"
    # TODO(#12163) reenable bot once not conflicting with transfer
    OVERRIDES="blobSink.enabled=true,bot.enabled=false"
    if [ -n "$execution_client" ]; then
      OVERRIDES="$OVERRIDES,ethereum.execution.client=$execution_client"
    fi
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false RESOURCES_FILE=gcloud-1tps-sim.yaml  \
      ./scripts/test_k8s.sh gke src/spartan/transfer.test.ts ci-fast-epoch.yaml ${NAMESPACE:-"transfer${NAME_POSTFIX:-}"}
    ;;
  "test-gke-1tps")
    OVERRIDES="blobSink.enabled=true,bot.enabled=false" \
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false RESOURCES_FILE=gcloud-1tps-sim.yaml \
      ./scripts/test_k8s.sh gke src/spartan/1tps.test.ts ci-1tps.yaml ${NAMESPACE:-"one-tps${NAME_POSTFIX:-}"}
    ;;
  "test-gke-4epochs")
    # TODO(#12163) reenable bot once not conflicting with transfer
    OVERRIDES="bot.enabled=false" \
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false \
      ./scripts/test_k8s.sh gke src/spartan/4epochs.test.ts ci-1tps.yaml ${NAMESPACE:-"four-epochs${NAME_POSTFIX:-}"}
    ;;
  "test-gke-upgrade-rollup-version")
    OVERRIDES="bot.enabled=false,ethereum.acceleratedTestDeployments=false" \
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false \
      ./scripts/test_k8s.sh gke src/spartan/upgrade_rollup_version.test.ts ci.yaml ${NAMESPACE:-"upgrade-rollup-version${NAME_POSTFIX:-}"}
    ;;
  "test-gke-cli-upgrade")
    OVERRIDES="telemetry.enabled=false" \
    FRESH_INSTALL=${FRESH_INSTALL:-true} INSTALL_METRICS=false \
      ./scripts/test_k8s.sh gke src/spartan/upgrade_via_cli.test.ts 1-validators.yaml ${NAMESPACE:-"upgrade-via-cli${NAME_POSTFIX:-}"}
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
