#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(hash_str $(cache_content_hash .rebuild_patterns) $(../yarn-project/bootstrap.sh hash))

dump_fail "flock scripts/logs/install_deps.lock retry scripts/install_deps.sh >&2"

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
  if [ "$(arch)" == "arm64" ]; then
    # Currently maddiaa/eth2-testnet-genesis is not published for arm64. Skip KIND tests.
    return
  fi
  # Note: commands that start with 'timeout ...' override the default timeout.
  # TODO figure out why these take long sometimes.
  # echo "$hash ./spartan/bootstrap.sh test-kind-smoke"

  # if [ "$CI_NIGHTLY" -eq 1 ]; then
  #   NIGHTLY_NS=nightly-$(date -u +%Y%m%d)
  #   echo "$hash:TIMEOUT=20m FRESH_INSTALL=no-deploy NAMESPACE=$NIGHTLY_NS ./spartan/bootstrap.sh test-gke-transfer reth"
  #   echo "$hash:TIMEOUT=20m FRESH_INSTALL=no-deploy NAMESPACE=$NIGHTLY_NS ./spartan/bootstrap.sh test-gke-transfer geth"

    # Nethermind test can be enabled once https://github.com/NethermindEth/nethermind/pull/8897 is released
    # echo "$hash:TIMEOUT=20m FRESH_INSTALL=no-deploy NAMESPACE=$NIGHTLY_NS ./spartan/bootstrap.sh test-gke-transfer nethermind"

    #echo "$hash:TIMEOUT=30m FRESH_INSTALL=no-deploy NAMESPACE=$NIGHTLY_NS ./spartan/bootstrap.sh test-gke-1tps"
    #echo "$hash:TIMEOUT=30m FRESH_INSTALL=no-deploy NAMESPACE=$NIGHTLY_NS ./spartan/bootstrap.sh test-gke-4epochs"

    # These tests get their own namespaces otherwise they'd interfere with the other tests
    #echo "$hash:TIMEOUT=30m MONITOR_DEPLOYMENT=false NAME_POSTFIX='-$NIGHTLY_NS' ./spartan/bootstrap.sh test-gke-upgrade-rollup-version"
    #echo "$hash:TIMEOUT=30m MONITOR_DEPLOYMENT=false NAME_POSTFIX='-$NIGHTLY_NS' ./spartan/bootstrap.sh test-gke-cli-upgrade"

    # TODO(#12791) re-enable
    # echo "$hash:TIMEOUT=50m ./spartan/bootstrap.sh test-kind-4epochs-sepolia"
    # echo "$hash:TIMEOUT=30m ./spartan/bootstrap.sh test-prod-deployment"
  # fi
  if [ "$CI_SCENARIO_TEST" -eq 1 ]; then
    local run_test_script="yarn-project/end-to-end/scripts/run_test.sh"
    DEFAULT_NAMESPACE="scenario-$(git rev-parse --short HEAD)"
    NAMESPACE=${NAMESPACE:-$DEFAULT_NAMESPACE}
    K8S_CLUSTER=${K8S_CLUSTER:-"aztec-gke-private"}
    PROJECT_ID=${PROJECT_ID:-"testnet-440309"}
    REGION=${REGION:-"us-west1-a"}
    local env_vars="NAMESPACE=$NAMESPACE K8S_CLUSTER=$K8S_CLUSTER PROJECT_ID=$PROJECT_ID REGION=$REGION"
    echo "$hash:TIMEOUT=20m $env_vars $run_test_script simple src/spartan/smoke.test.ts"
    echo "$hash:TIMEOUT=20m $env_vars $run_test_script simple src/spartan/transfer.test.ts"
  fi
}

function start_env {
  if [ "$CI_NIGHTLY" -eq 1 ] && [ "$(arch)" != "arm64" ]; then
    NIGHTLY_NS=nightly-$(git rev-parse --short HEAD)
    export MONITOR_DEPLOYMENT=false
    export WAIT_FOR_DEPLOYMENT=false
    export CLUSTER_NAME=aztec-gke-private
    export ZONE=us-west1-a
    export GCP_PROJECT_ID=${GCP_PROJECT_ID:-"testnet-440309"}
    echo "Installing test network in namespace $NIGHTLY_NS"
    ./scripts/deploy_k8s.sh gke "$NIGHTLY_NS" ci-fast-epoch.yaml false "mnemonic.tmp" "$NIGHTLY_NS" "$GCP_PROJECT_ID"
  fi
}

function stop_env {
  if [ "$CI_NIGHTLY" -eq 1 ] && [ "$(arch)" != "arm64" ]; then
    NIGHTLY_NS=nightly-$(date -u +%Y%m%d)
    echo "Uninstalling test network in namespace $NIGHTLY_NS"
    ./scripts/cleanup_k8s.sh "$NIGHTLY_NS" "$NIGHTLY_NS"
  fi
}

function test {
  echo_header "spartan test"
  if [ "$CI" -eq 1 ]; then
    echo "Activating service account"
    gcloud auth activate-service-account --key-file=/tmp/gcp-key.json
    gcloud config set project "$GCP_PROJECT_ID"
  fi

  if [ "$CI_SCENARIO_TEST" -eq 1 ]; then
    echo "Running network scenario tests sequentially"
    test_cmds | filter_test_cmds
  else
    echo "Running spartan test"
    test_cmds | filter_test_cmds | parallelize
  fi
}

case "$cmd" in
  "")
    # do nothing but the install_deps.sh above
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
  test|test_cmds|gke|build|start_env|stop_env)
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
