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
  denoise "helm lint ./charts/otel-metrics-collector/"
  denoise "helm lint ./charts/otel-metrics-collector/ -f ./charts/otel-metrics-collector/test-values/irm-enabled.yaml"
  denoise "helm lint ./aztec-keystore/"
  denoise "helm lint ./aztec-node/ --set global.aztecImage.tag=lint"
  denoise "helm lint ./aztec-prover-stack/"
  denoise "helm lint ./aztec-snapshots/ --set snapshots.frequency='0 */6 * * *' --set snapshots.nodeUrl=http://lint --set snapshots.bucket=lint"
  denoise "helm lint ./aztec-validator/"
  denoise "helm lint ./eth-devnet/"
  denoise "terraform fmt -check -recursive ./terraform/"
  denoise ./scripts/check_env_vars.sh
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
  # For GKE access: ensure both gcloud and the GKE auth plugin are installed.
  # gcloud itself is installed by install_deps.sh; this only handles the auth plugin
  # (and the Ubuntu-specific gcloud install for backwards compatibility).
  if [[ "$(os)" == "macos" ]]; then
    if ! command -v gke-gcloud-auth-plugin &> /dev/null; then
      gcloud components install --quiet gke-gcloud-auth-plugin
      if ! command -v gke-gcloud-auth-plugin &> /dev/null; then
        echo "gke-gcloud-auth-plugin installed but not on PATH. Add this to your shell rc:" >&2
        echo "  export PATH=\"\$(brew --prefix)/share/google-cloud-sdk/bin:\$PATH\"" >&2
        exit 1
      fi
    fi
  elif ! command -v gcloud &> /dev/null; then
    if [ -f /etc/os-release ] && grep -qi "Ubuntu" /etc/os-release; then
      sudo apt update
      sudo apt install -y apt-transport-https ca-certificates gnupg curl
      sudo rm -f /usr/share/keyrings/cloud.google.gpg && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
      echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
      sudo apt install -y google-cloud-cli
      sudo apt install google-cloud-cli-gke-gcloud-auth-plugin
      echo "Now you can run 'gcloud init'. Exiting with 1 as this is a necessary step."
      exit 1
    else
      echo "gcloud not found. This is needed for GKE kubernetes usage." >&2
      echo "If needed, install gcloud and do 'gcloud components install gke-gcloud-auth-plugin', then 'gcloud init'" >&2
      exit 1
    fi
  fi
}

function test_cmds {
  :
}

function test {
  :
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
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
