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

# Retrieve the admin API key stored as a K8s Secret during deployment.
# Exported so the test runner can authenticate against the admin RPC endpoint.
function export_admin_api_key {
  export AZTEC_ADMIN_API_KEY
  AZTEC_ADMIN_API_KEY=$(kubectl get secret aztec-admin-api-key \
    --namespace "$NAMESPACE" \
    -o jsonpath='{.data.key}' 2>/dev/null | base64 -d 2>/dev/null || true)
}

# Run spartan tests sequentially with k8s log enrichment, collecting failures.
function run_network_tests {
  local env_file="$1"
  shift
  source_network_env "$env_file"
  gcp_auth
  export SCENARIO_TESTS=1
  export_admin_api_key
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

function slack_notify_scenario_pass {
  local label="$1"
  if [[ "${REF_NAME:-}" == v* ]]; then
    slack_notify "Scenario ${label} tests PASSED on *${REF_NAME}*" "#alerts-next-scenario"
  fi
}

function network_tests_1 {
  run_network_tests "$1" "smoke.test.ts" "${NETWORK_TESTS_1[@]}"
  slack_notify_scenario_pass "set-1"
}
function network_tests_2 {
  run_network_tests "$1" "smoke.test.ts" "${NETWORK_TESTS_2[@]}"
  slack_notify_scenario_pass "set-2"
}
function network_tests {
  run_network_tests "$1" "smoke.test.ts" "${NETWORK_TESTS_1[@]}" "${NETWORK_TESTS_2[@]}"
  slack_notify_scenario_pass "all"
}

function network_bench_cmds {
  local high_value_tps=0.1
  local low_value_tps_list=(0.1 0.2 0.5 1 2)

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

function block_capacity_bench_cmds {
  local timeout=7200  # 2h
  echo "$(hash):TIMEOUT=${timeout} BENCH_OUTPUT=bench-out/block_capacity.bench.json $root/yarn-project/end-to-end/scripts/run_test.sh simple block_capacity.test.ts"
}

function bench_10tps_cmds {
  # Mix: 1 tps of high-value + 9 tps of low-value, total still 10 tps. The
  # high-value lane is what we measure for the headline client-observed
  # inclusion latency (low-value txs pay near-network-min and are allowed to
  # fail fee checks, so they would skew the headline if measured).
  local high_value_tps=1
  local low_value_tps=9
  local test_duration=${TEST_DURATION_SECONDS:-600} # 10 mins
  local timeout=${BENCH_TIMEOUT_SECONDS:-7200} # account for initial committee formation
  echo "$(hash):TIMEOUT=${timeout} BENCH_RUN_ID=${BENCH_RUN_ID:-} BENCH_OUTPUT=bench-out/n_tps.10tps.bench.json BENCH_SCENARIO=10tps LOW_VALUE_TPS=${low_value_tps} HIGH_VALUE_TPS=${high_value_tps} TEST_DURATION_SECONDS=${test_duration} $root/yarn-project/end-to-end/scripts/run_test.sh simple n_tps.test.ts"
}

function network_bench {
  rm -rf bench-out
  mkdir -p bench-out

  local env_file="$1"
  source_network_env $env_file

  echo_header "spartan bench"
  gcp_auth
  export_admin_api_key
  export K8S_ENRICHER=${K8S_ENRICHER:-1}
  network_bench_cmds | parallelize 1
}

function proving_bench {
  rm -rf bench-out
  mkdir -p bench-out

  local env_file="$1"
  source_network_env $env_file

  echo_header "spartan proving bench"
  gcp_auth
  export_admin_api_key
  export K8S_ENRICHER=${K8S_ENRICHER:-1}
  proving_bench_cmds | parallelize 1
}

function block_capacity_bench {
  rm -rf bench-out
  mkdir -p bench-out

  local env_file="$1"
  source_network_env $env_file

  echo_header "spartan block capacity bench"
  gcp_auth
  export_admin_api_key
  export K8S_ENRICHER=${K8S_ENRICHER:-1}
  block_capacity_bench_cmds | parallelize 1
}

function bench_10tps {
  rm -rf bench-out
  mkdir -p bench-out

  local env_file="$1"
  source_network_env $env_file

  echo_header "spartan bench-10tps"
  gcp_auth
  export_admin_api_key
  export K8S_ENRICHER=${K8S_ENRICHER:-1}
  export BENCH_RUN_ID="${BENCH_RUN_ID:-$(date -u +%Y%m%d)-${COMMIT_HASH:0:10}}"
  bench_10tps_cmds | parallelize 1

  local metadata="/tmp/n_tps_timing_data.json"
  local run_json="bench-out/bench-10tps-${BENCH_RUN_ID}.json"
  if [[ -f "$metadata" ]]; then
    local started=$(jq -r .startedAt < "$metadata")
    local ended=$(jq -r .endedAt < "$metadata")
    echo "Scraping bench-10tps run ${BENCH_RUN_ID} (started=${started} ended=${ended})"
    NAMESPACE="$NAMESPACE" GCP_PROJECT_ID="${GCP_PROJECT_ID:-}" ./scripts/bench_10tps/bench_scrape.ts \
      --run-id "$BENCH_RUN_ID" \
      --started "$started" \
      --ended "$ended" \
      --target-tps 10 \
      --workload sha256_hash_1024 \
      --output "$run_json" \
      --inclusion-records "$metadata" \
      --wait-for-pending-zero \
      --max-pending-wait-seconds "${BENCH_SCRAPE_MAX_PENDING_WAIT_SECONDS:-3600}" \
      || echo "[bench_10tps] scraper failed (non-fatal)"
    network_bench_upload "$run_json" || echo "[network_bench] upload failed (non-fatal)"
  else
    echo "[bench_10tps] no timing metadata at ${metadata}; skipping scraper"
  fi
}

# One point of the Set A inclusion sweep (A-1223). Same scrape+upload path as
# bench_10tps, but parameterized by TARGET_TPS and tagged with a shared
# BENCH_SWEEP_ID so the 1/5/10 points group as one sweep (schema v4). Load is
# all high-value at TARGET_TPS so the headline client-observed inclusion latency
# reflects the full target rate. Each point runs in its own namespace.
function bench_inclusion_point_cmds {
  local tps=${TARGET_TPS:-10}
  local test_duration=${TEST_DURATION_SECONDS:-600} # 10 mins
  local timeout=${BENCH_TIMEOUT_SECONDS:-7200} # account for committee formation
  local scenario="incl_${tps/./_}tps"
  echo "$(hash):TIMEOUT=${timeout} BENCH_RUN_ID=${BENCH_RUN_ID:-} BENCH_OUTPUT=bench-out/n_tps.${scenario}.bench.json BENCH_SCENARIO=${scenario} LOW_VALUE_TPS=0 HIGH_VALUE_TPS=${tps} TEST_DURATION_SECONDS=${test_duration} $root/yarn-project/end-to-end/scripts/run_test.sh simple n_tps.test.ts"
}

function bench_inclusion_point {
  rm -rf bench-out
  mkdir -p bench-out

  local env_file="$1"
  source_network_env $env_file

  local tps=${TARGET_TPS:-10}
  echo_header "spartan inclusion-sweep point (${tps} TPS)"
  gcp_auth
  export_admin_api_key
  export K8S_ENRICHER=${K8S_ENRICHER:-1}
  export BENCH_RUN_ID="${BENCH_RUN_ID:-$(date -u +%Y%m%d)-incl-${tps}tps-${COMMIT_HASH:0:10}}"
  bench_inclusion_point_cmds | parallelize 1

  local metadata="/tmp/n_tps_timing_data.json"
  local run_json="bench-out/bench-inclusion-${tps}tps-${BENCH_RUN_ID}.json"
  if [[ -f "$metadata" ]]; then
    local started=$(jq -r .startedAt < "$metadata")
    local ended=$(jq -r .endedAt < "$metadata")
    echo "Scraping inclusion-sweep point ${tps} TPS (run ${BENCH_RUN_ID}, started=${started} ended=${ended})"
    NAMESPACE="$NAMESPACE" GCP_PROJECT_ID="${GCP_PROJECT_ID:-}" ./scripts/bench_10tps/bench_scrape.ts \
      --run-id "$BENCH_RUN_ID" \
      --started "$started" \
      --ended "$ended" \
      --target-tps "$tps" \
      --sweep-id "${BENCH_SWEEP_ID:-}" \
      --sweep-label "${BENCH_SWEEP_LABEL:-inclusion-sweep}" \
      --workload sha256_hash_1024 \
      --output "$run_json" \
      --inclusion-records "$metadata" \
      --wait-for-pending-zero \
      --max-pending-wait-seconds "${BENCH_SCRAPE_MAX_PENDING_WAIT_SECONDS:-3600}" \
      || echo "[bench_inclusion_point] scraper failed (non-fatal)"
    network_bench_upload "$run_json" || echo "[network_bench] upload failed (non-fatal)"
  else
    echo "[bench_inclusion_point] no timing metadata at ${metadata}; skipping scraper"
  fi
}

function network_bench_upload {
  local run_json=$1
  if [[ "${CI:-0}" != "1" ]]; then
    echo "[network_bench] CI != 1, skipping upload (run JSON at ${run_json})"
    return 0
  fi
  if [[ ! -f "$run_json" ]]; then
    echo "[network_bench] no run JSON at ${run_json}; skipping upload"
    return 0
  fi

  # Reject anything that's not the schema we've designed the index against.
  local schema=$(jq -r .schemaVersion "$run_json")
  if [[ "$schema" != "4" ]]; then
    echo "[network_bench] run JSON has schemaVersion '$schema', expected '4'; skipping upload"
    return 0
  fi

  local bucket="gs://aztec-testnet/network_bench"
  local run_id=$(jq -r .run.runId "$run_json")
  local target="${bucket}/${run_id}.json"

  echo "[network_bench] uploading ${run_json} to ${target}"
  gcloud storage cp "$run_json" "$target"

  local entry=$(jq '{
    runId: .run.runId,
    path: (.run.runId + ".json"),
    startedAt: .run.startedAt,
    endedAt: .run.endedAt,
    targetTps: .run.targetTps,
    sweepId: .run.sweepId,
    sweepLabel: .run.sweepLabel,
    workload: .run.workload,
    testDurationSeconds: .run.testDurationSeconds,
    namespace: .run.namespace,
    headlineKpi: .summary.headlineKpi,
    inclusionTpsMean: .summary.inclusionTpsMean,
    inclusionTpsPeak: .summary.inclusionTpsPeak,
    totalTxsMined: .summary.totalTxsMined,
    reorgCount: .summary.reorgCount
  }' "$run_json")

  local idx_local
  idx_local=$(mktemp)
  trap "rm -f $idx_local ${idx_local}.new" RETURN
  # Distinguish "index does not exist yet" (404 -> seed empty) from real errors
  # (auth/network/permission -> fail closed). Without this probe, a naive
  # `cp ... 2>/dev/null || seed_empty` would silently overwrite a healthy index
  # with a single-entry one whenever GCS hiccups.
  local desc_err
  if desc_err=$(gcloud storage objects describe "${bucket}/index.json" 2>&1 >/dev/null); then
    gcloud storage cp "${bucket}/index.json" "$idx_local"
  elif echo "$desc_err" | grep -qiE 'not.?found|matched no objects|404'; then
    echo "[network_bench] no remote index.json yet; seeding empty"
    echo '{"schemaVersion":"1","runs":[]}' > "$idx_local"
  else
    echo "[network_bench] cannot read remote index.json:"
    echo "$desc_err" | head -5
    return 1
  fi

  jq --argjson entry "$entry" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
    .schemaVersion = "1"
    | .generatedAt = $ts
    | .runs = ((.runs // []) | map(select(.runId != $entry.runId)) + [$entry]
              | sort_by(.endedAt) | reverse)
  ' "$idx_local" > "${idx_local}.new"

  gcloud storage cp "${idx_local}.new" "${bucket}/index.json"
  echo "[network_bench] updated ${bucket}/index.json"
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

    export K8S_ENRICHER=${K8S_ENRICHER:-1}
    if [[ "${RUN_TESTS:-}" == "true" ]]; then
      if [[ -n "$test_set" ]]; then
        network_tests_$test_set "$env_file"
      else
        network_tests "$env_file"
      fi
    fi
    ;;
  "wait_for_l2_block")
    env_file="$1"
    source_env_basic "$env_file"
    gcp_auth
    source_network_env "$env_file"
    ./scripts/wait_for_l2_block.sh "$NAMESPACE"
    ;;
  "single_test")
    run_network_tests "$1" "$2"
    ;;

  network_tests|network_tests_1|network_tests_2|network_bench|proving_bench|block_capacity_bench|bench_10tps|bench_inclusion_point)
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
    export K8S_ENRICHER=${K8S_ENRICHER:-1}
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
