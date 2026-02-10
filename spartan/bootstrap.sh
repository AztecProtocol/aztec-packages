#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

function hash {
  hash_str $(cache_content_hash .rebuild_patterns) $(../yarn-project/bootstrap.sh hash)
}

dump_fail "flock scripts/logs/install_deps.lock retry scripts/install_deps.sh >&2"

source ./scripts/source_env_basic.sh
source ./scripts/source_network_env.sh
source ./scripts/gcp_auth.sh

function build {
  denoise "helm lint ./aztec-bot/"
  denoise "helm lint ./aztec-chaos-scenarios/"
  denoise "helm lint ./aztec-keystore/"
  denoise "helm lint ./aztec-node/"
  denoise "helm lint ./aztec-prover-stack/"
  denoise "helm lint ./aztec-snapshots/"
  denoise "helm lint ./aztec-validator/"
  denoise "helm lint ./eth-devnet/"
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
  :
}

function test {
  :
}

# Test sets for network scenario tests (split across two EC2 instances).
# smoke.test.ts is always ran before these tests.
NETWORK_TESTS_1=(
  reorg.test.ts
  upgrade_rollup_version.test.ts
  validator_ha.test.ts
)
NETWORK_TESTS_2=(
  transfer.test.ts
  slash_inactivity.test.ts
  proving.test.ts
  prover-node.test.ts
  gating-passive.test.ts
  invalidate_blocks.test.ts
  mempool_limit.test.ts
  upgrade_governance_proposer.test.ts
  validator_nuke_and_suppression.test.ts
  mbps.test.ts
)

# Run spartan tests sequentially with k8s log enrichment, collecting failures.
function run_network_tests {
  local env_file="$1"
  shift
  source_network_env "$env_file"
  gcp_auth
  export SCENARIO_TESTS=1
  local failed=()
  for test_file in "$@"; do
    echo_header "Running $test_file"
    if ! scripts/k8s_enriched_denoise "$NAMESPACE" \
         "$root/yarn-project/end-to-end/scripts/run_test.sh simple src/spartan/$test_file"; then
      failed+=("$test_file")
      echo "FAILED: $test_file"
    fi
  done
  if [[ ${#failed[@]} -gt 0 ]]; then
    echo_header "Failed tests: ${failed[*]}"
    return 1
  fi
}

function network_tests_1 {
  run_network_tests "$1" "smoke.test.ts" "${NETWORK_TESTS_1[@]}"
}
function network_tests_2 {
  run_network_tests "$1" "smoke.test.ts" "${NETWORK_TESTS_2[@]}"
}
function network_tests {
  run_network_tests "$1" "smoke.test.ts" "${NETWORK_TESTS_1[@]}" "${NETWORK_TESTS_2[@]}"
}

function network_bench_cmds {
  local high_value_tps=0.1
  local low_value_tps_list=(0.1 0.2 0.5 1)

  for low_value_tps in "${low_value_tps_list[@]}"; do
    local low_label=${low_value_tps/./_}
    local high_label=${high_value_tps/./_}
    local scenario="low_${low_label}_high_${high_label}"
    local test_duration=600 #10 mins
    local timeout=3600 #1 hour
    echo "$(hash):TIMEOUT=${timeout} BENCH_OUTPUT=bench-out/n_tps.${scenario}.bench.json BENCH_SCENARIO=${scenario} LOW_VALUE_TPS=${low_value_tps} HIGH_VALUE_TPS=${high_value_tps} TEST_DURATION_SECONDS=${test_duration} $root/yarn-project/end-to-end/scripts/run_test.sh simple n_tps.test.ts"
  done
}

function proving_bench_cmds {
  local tps=1
  local timeout=9000  # 2.5h
  echo "$(hash):TIMEOUT=${timeout} TPS=${tps} BENCH_OUTPUT=bench-out/n_tps_prove.${tps}tps.bench.json $root/yarn-project/end-to-end/scripts/run_test.sh simple n_tps_prove.test.ts"
}

function network_bench {
  rm -rf bench-out
  mkdir -p bench-out

  local env_file="$1"
  source_network_env $env_file

  echo_header "spartan bench"
  gcp_auth
  network_bench_cmds | parallelize 1
}

function proving_bench {
  rm -rf bench-out
  mkdir -p bench-out

  local env_file="$1"
  source_network_env $env_file

  echo_header "spartan proving bench"
  gcp_auth
  proving_bench_cmds | parallelize 1
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
    env_file="$1"
    low_watermark="${2:-0.5}"
    high_watermark="${3:-1.0}"

    ./scripts/ensure_funded_environment.sh "$env_file" "$FUNDING_PRIVATE_KEY" "$low_watermark" "$high_watermark"
    ;;
  "network_deploy")
    # Args: <env_file> [test_set]
    env_file="$1"
    test_set="${2:-}"

    #Sets up basic env vars like RUN_TESTS
    source_env_basic "$env_file"

    # Run the network deploy script
    DENOISE=1 denoise "./scripts/network_deploy.sh $env_file"

    if [[ "${RUN_TESTS:-}" == "true" ]]; then
      if [[ -n "$test_set" ]]; then
        network_tests_$test_set "$env_file"
      else
        network_tests "$env_file"
      fi
    fi
    ;;
  "single_test")
    run_network_tests "$1" "$2"
    ;;

  network_tests|network_tests_1|network_tests_2|network_bench|proving_bench)
    env_file="$1"
    $cmd "$env_file"
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
    scripts/deploy_chaos_mesh.sh
    ;;
  "metrics-kind")
    metrics/install-kind.sh
    ;;
  "metrics-prod")
    metrics/install-prod.sh
    ;;
  "network-shaping")
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
    echo $(hash)
    ;;
  test|test_cmds|gke|build|gcp_auth)
    $cmd
    ;;
  "test-kind-upgrade-rollup")
    source scripts/source_network_env.sh
    source_network_env ${KIND_ENV:-kind-provers}
    namespace="upgrade-rollup-version${NAME_POSTFIX:-}"
    INSTALL_METRICS=false \
      ./scripts/test_kind.sh src/spartan/upgrade_rollup_version.test.ts "$namespace"
    ;;
  "network_teardown")
    env_file="$1"
    # Sets up basic env vars like CLUSTER for gcp auth
    source_env_basic "$env_file"
    gcp_auth
    ./scripts/network_teardown.sh
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
