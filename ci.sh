#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
source $ci3/source_redis
source $ci3/source_refname

cmd=${1:-}
arch=${ARCH:-$(arch)}
NO_TERMINATE=${NO_TERMINATE:-0}
BRANCH=${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}
ci3_workflow_id=128853861

function echo_cmd {
  local name=$1
  shift
  printf "${blue}${bold}%21s${reset}: %s\n" $name "$(echo $@ | sed 's/\.\\n/.\n                      /g')"
}

function print_usage {
  echo "usage: $(basename $0) <cmd>"
  echo
  echo_cmd "dash"                  "Display a dashboard showing CI runs for the current user."
  echo_cmd "fast"                  "Spin up an EC2 instance and run bootstrap ci-fast."
  echo_cmd "full"                  "Spin up an EC2 instance and run bootstrap ci-full."
  echo_cmd "full-no-test-cache"    "Spin up an EC2 instance and run bootstrap ci-full-no-test-cache."
  echo_cmd "docs"                  "Spin up an EC2 instance and run docs-only CI."
  echo_cmd "barretenberg"          "Spin up an EC2 instance and run barretenberg-only CI."
  echo_cmd "grind"                 "Spin up EC2 instances to run parallel full CI runs."
  echo_cmd "merge-queue"           "Spin up EC2 instances to run the merge-queue jobs."
  echo_cmd "grind-test"            "Spin up an EC2 and grind a given test command."
  echo_cmd "network-deploy"        "Spin up an EC2 instance to deploy a network."
  echo_cmd "network-scenarios"     "Spin up EC2 instances to run network scenario tests in parallel."
  echo_cmd "network-tests"         "Spin up an EC2 instance to run tests on a network."
  echo_cmd "network-bench"         "Spin up an EC2 instance to run benchmarks on a network."
  echo_cmd "network-proving-bench" "Spin up an EC2 instance to deploy a network and run proving benchmarks. Set SKIP_NETWORK_DEPLOY=1 to skip deploy."
  echo_cmd "network-bench-10tps"   "Spin up an EC2 instance to run the 10 TPS benchmark on bench-10tps."
  echo_cmd "network-teardown"      "Spin up an EC2 instance to teardown a network deployment."
  echo_cmd "network-tests-kind"    "Spin up an EC2 instance to run a KIND-based spartan test."
  echo_cmd "deploy-rollup-upgrade" "Spin up an EC2 instance to deploy a rollup upgrade."
  echo_cmd "chonk-input-update"    "Spin up an EC2 instance to update pinned Chonk IVC inputs and push the diff."
  echo_cmd "release"               "Spin up an EC2 instance and run bootstrap release."
  echo_cmd "ci-private-release"     "Locally dry-run the release of every project except release-image, then publish release-image to the internal GCP Artifact Registry."
  echo_cmd "shell-new"             "Spin up an EC2 instance, clone the repo, and drop into a shell."
  echo_cmd "shell-container"       "Shell into a running build container. Optional filter tokens (e.g. 'pr-123 bench') select the instance; defaults to the current branch."
  echo_cmd "shell-host"            "Shell into a running build host. Same instance selection as shell-container."
  echo_cmd "log"                   "Display the log of the given log ID."
  echo_cmd "test-timings"          "Download per-test timing JSONL for a job: test-timings <ci_log_id> <folder>."
  echo_cmd "kill"                  "Terminate running build instances matching the filter tokens (default: current branch)."
  echo_cmd "draft"                 "Mark the current PR as draft (no automatic CI runs when pushing)."
  echo_cmd "ready"                 "Mark the current PR as ready (enable automatic CI runs when pushing)."
  echo_cmd "pr-url"                "Print the URL of the current PR associated with the branch."
  echo_cmd "avm-inputs-collection" "Run e2e tests, dump AVM circuit inputs, upload to cache."
  echo_cmd "avm-check-circuit"     "Download cached AVM inputs, run check-circuit on each."
  echo_cmd "help"                  "Display this help message."
}

[ -n "$cmd" ] && shift

# Connecting to a running build instance: discover by the Group=build-instance tag
# and match filter tokens against the Name (which aws_instance_name builds as
# <repo>_<ref>_<arch>[_<job>]), rather than reconstructing the exact name (which
# varies by arch/job/count). This is what lets `shell-container pr-123 bench` etc. work.

# Echo running build instances as: <Name>\t<InstanceId>\t<PublicIp>\t<LaunchTime>
function list_build_instances {
  aws ec2 describe-instances \
    --region us-east-2 \
    --filters "Name=tag:Group,Values=build-instance" "Name=instance-state-name,Values=running" \
    --query "Reservations[].Instances[].[Tags[?Key=='Name']|[0].Value, InstanceId, PublicIpAddress, LaunchTime]" \
    --output text
}

# Echo running build instances whose Name matches every filter token (case-insensitive
# substring). With no tokens, defaults to the current branch's canonical name.
function filter_build_instances {
  local filters=("$@") rows f
  [ "${#filters[@]}" -eq 0 ] && filters=("$(aws_instance_name "$BRANCH" "$arch")")
  rows=$(list_build_instances)
  for f in "${filters[@]}"; do
    # Sanitise the token the same way instance names are (e.g. a branch's '/' -> '_'),
    # so passing a raw branch name like 'mv/f-669' still matches '..._mv_f-669_...'.
    f=$(printf '%s' "$f" | tr -c 'a-zA-Z0-9-' '_')
    rows=$(printf '%s\n' "$rows" | awk -v p="$f" 'index(tolower($1), tolower(p))')
  done
  printf '%s\n' "$rows" | sed '/^$/d'
}

# Resolve exactly one instance from the filter tokens; sets iid/ip/resolved_name.
# 0 matches -> error + list everything; >1 -> interactive pick on a TTY, else error
# listing the candidates so you can add a narrowing token (e.g. an arch or job id).
function resolve_instance {
  local matches chosen sel i
  matches=$(filter_build_instances "$@")
  if [ -z "$matches" ]; then
    echo_stderr "No running build instance matches: ${*:-$BRANCH}"
    echo_stderr "Running build instances:"
    list_build_instances | awk '{print "  " $1}' | sort || true
    exit 1
  fi
  if [ "$(printf '%s\n' "$matches" | wc -l)" -eq 1 ]; then
    chosen=$matches
  elif [ -t 0 ]; then
    echo_stderr "Multiple build instances match '${*:-$BRANCH}':"
    i=1
    while IFS= read -r line; do
      echo_stderr "  $i) $(printf '%s' "$line" | awk '{print $1}')"
      i=$((i + 1))
    done <<< "$matches"
    read -r -p "select [1-$((i - 1))]: " sel
    [[ "$sel" =~ ^[0-9]+$ ]] || { echo_stderr "Invalid selection."; exit 1; }
    chosen=$(printf '%s\n' "$matches" | sed -n "${sel}p")
    [ -z "$chosen" ] && echo_stderr "Invalid selection." && exit 1
  else
    echo_stderr "Multiple build instances match '${*}' — add a narrowing token (e.g. an arch or job id):"
    printf '%s\n' "$matches" | awk '{print "  " $1}'
    exit 1
  fi
  resolved_name=$(printf '%s' "$chosen" | awk '{print $1}')
  iid=$(printf '%s' "$chosen" | awk '{print $2}')
  ip=$(printf '%s' "$chosen" | awk '{print $3}')
  echo_stderr "Connecting to $resolved_name ($iid)."
}

function get_latest_run_id {
  gh run list --workflow $ci3_workflow_id -b $BRANCH --limit 1 --json databaseId -q .[0].databaseId
}

# Jobs in the ci dashboards are grouped on a single line by RUN_ID.
export RUN_ID=${RUN_ID:-$(date +%s%3N)}

function multi_job_run {
  if [[ -z "${CI_DASHBOARD:-}" ]]; then
    if [[ "$REF_NAME" =~ ^gh-readonly-queue/ ]]; then
      export CI_DASHBOARD=${TARGET_BRANCH:-local}
    else
      export CI_DASHBOARD="prs"
    fi
  fi
  export AWS_SHUTDOWN_TIME=${AWS_SHUTDOWN_TIME:-75}
  export AWS_SHUTDOWN_TIME_ARM=${AWS_SHUTDOWN_TIME_ARM:-90}
  export DENOISE=1
  export DENOISE_WIDTH=32
  # Only the first job (the amd64 full build) runs the dedicated bench box and uploads;
  # the rest bench inline as a breakage check (see bootstrap.sh build_and_test). This
  # de-races grind runs (e.g. merge-queue-heavy fires ~10 instances) that would otherwise
  # all upload to the same bench cache key.
  local bench_primary=${1%% *}
  export bench_primary
  run() {
    [ -n "${4:-}" ] && export REF_NAME=$4
    local bench_upload=0
    [ "$1" == "$bench_primary" ] && bench_upload=${BENCH_UPLOAD:-0}
    # Timestamp the bootstrap_ec2 (instance request) sublog. denoise runs the command
    # under pipefail and bootstrap_ec2 handles spot-eviction retry internally (exec), so
    # piping through add_timestamps preserves its exit code. DENOISE_DISPLAY_NAME keeps
    # the parent log's "Executing:" line free of the pipe.
    PARENT_LOG_ID=$RUN_ID JOB_ID=$1 INSTANCE_POSTFIX=$1 ARCH=$2 BENCH_UPLOAD=$bench_upload \
      DENOISE_DISPLAY_NAME="bootstrap_ec2 './bootstrap.sh $3'" \
      exec denoise "bootstrap_ec2 './bootstrap.sh $3' 2>&1 | add_timestamps"
  }
  export -f run

  parallel --colsep ' ' --jobs 100 --termseq 'TERM,10000' \
    --tagstring '{1}' \
    --line-buffered --halt now,fail=1 \
    'run {1} {2} {3} {4}' ::: "$@" | add_timestamps | DUP=1 cache_log "CI run" $RUN_ID
}

# Jobs in the ci dashboards are grouped on a single line by RUN_ID.
export RUN_ID=${RUN_ID:-$(date +%s%3N)}

case "$cmd" in
  dash)
    watch_ci -s next,prs --user --watch
    ;;
  fast|docs|barretenberg|barretenberg-full)
    export CI_DASHBOARD="prs"
    # Route through multi_job_run (even for a single instance) so the runner-side
    # orchestration — including the spot/instance request — is captured into a
    # parent dashboard log, matching merge-queue. The job id stays "x-$cmd" so the
    # GitHub status check name is unchanged.
    multi_job_run "x-$cmd amd64 ci-$cmd"
    ;;
  bench)
    # Launched by the build instance on uploadable runs to produce stable benchmark
    # numbers on a dedicated, FIXED-type instance. AWS_INSTANCE pins the exact type
    # (bypasses spot pool diversification) — that's what keeps numbers comparable. We use
    # bare metal (m6a.metal): a sub-host instance (e.g. m6a.32xlarge) shares its physical
    # host with other tenants, and a memory-heavy neighbour steals memory bandwidth, which
    # showed up as bimodal variance in the bandwidth-bound proving phases (MSM commitments)
    # while compute phases stayed flat. Metal is sole-tenant, so there's no neighbour.
    # Spot vs on-demand is the same hardware, so we try spot first and fall back to
    # on-demand (the default fleet behaviour); a mid-run spot reclaim is handled by
    # bootstrap_ec2's internal on-demand retry. CI_DASHBOARD and PARENT_LOG_ID are
    # inherited from the launching run so it nests as a sibling job.
    # Timestamp the instance-request output. pipefail (in a subshell, since ci.sh doesn't
    # set it globally) keeps bootstrap_ec2's exit code through add_timestamps — the
    # launching build instance waits on this fatally.
    ( set -o pipefail
      AWS_INSTANCE=m6a.metal JOB_ID=x-bench INSTANCE_POSTFIX=x-bench \
        bootstrap_ec2 "./bootstrap.sh ci-bench" 2>&1 | add_timestamps )
    ;;
  socket-fix)
    export CI_DASHBOARD="prs"
    export JOB_ID="x-socket-fix"
    export INSTANCE_POSTFIX="socket-fix"
    export CPUS=16
    # Capture the runner-side output (incl. instance request) to a parent dashboard
    # log. No denoise here: this is an interactive debug mode where raw output matters.
    PARENT_LOG_ID=$RUN_ID bootstrap_ec2 "./bootstrap.sh ci-socket-fix $*" 2>&1 | DUP=1 cache_log "CI run" $RUN_ID
    ;;
  full|full-no-test-cache)
    export CI_DASHBOARD="prs"
    export AWS_SHUTDOWN_TIME=75
    multi_job_run "x-$cmd amd64 ci-$cmd"
    ;;
  chonk-input-update)
    export CI_DASHBOARD="prs"
    export AWS_SHUTDOWN_TIME=90
    multi_job_run "x-$cmd amd64 ci-chonk-input-update"
    ;;
  barretenberg-debug)
    export CI_DASHBOARD="nightly"
    export JOB_ID="x-$cmd"
    export CPUS=192
    export AWS_SHUTDOWN_TIME=120
    bootstrap_ec2 "./bootstrap.sh ci-$cmd"
    ;;
  avm-inputs-collection|avm-check-circuit)
    export CI_DASHBOARD="nightly"
    export JOB_ID="x-$cmd"
    bootstrap_ec2 "./bootstrap.sh ci-$cmd"
    ;;
  grind)
    # Grind a default of 5 times.
    export CI_DASHBOARD="local"
    export DENOISE=1
    export DENOISE_WIDTH=32
    run() {
      JOB_ID=$1 INSTANCE_POSTFIX=$1 ARCH=$2 exec denoise "bootstrap_ec2 './bootstrap.sh $3'"
    }
    export -f run
    seq 1 ${1:-5} | parallel --jobs 100 --termseq 'TERM,10000' --tagstring '{= $_=~s/run (\w+).*/$1/; =}' --line-buffered \
      'run $USER-x{}-full amd64 ci-full-no-test-cache'
    ;;
  merge-queue)
    # We perform full runs of all tests on multiple x86, and a single fast run on arm64.
    multi_job_run \
      'x1-full amd64 ci-full-no-test-cache' \
      'a1-fast arm64 ci-fast'
    ;;
  merge-queue-heavy)
    # Heavy merge queue with 10 parallel grind runs, used for merge-train/spartan-v5 PRs.
    multi_job_run \
      'x'{1..10}'-full amd64 ci-full-no-test-cache' \
      'a1-fast arm64 ci-fast'
    ;;
  merge-queue-ci)
    # 10 parallel grind runs with no build cache and dry run of release, used for merge-train/ci PRs.
    export DRY_RUN=1
    export NO_CACHE=1
    multi_job_run \
      'x'{1..10}'-full amd64 ci-full-no-test-cache' \
      'a1-fast arm64 ci-fast' \
      "release amd64 ci-release v0.0.1-commit.$(git rev-parse --short HEAD)"
    ;;
  grind-test)
    full_cmd="$1"
    timeout="${2:-}"
    jobs_pct="${3:-200}"
    memsuspend_pct="${4:-50}"
    commit="${5:-}"
    # Extract test command (strip rebuild hash prefix) and hash it
    # Uses same hash as run_test_cmd's test_hash for consistency
    test_cmd="${full_cmd#* }"
    test_hash=$(hash_str_orig "$test_cmd")
    export CI_DASHBOARD="deflake"
    export JOB_ID="grind-test-$test_hash"
    export INSTANCE_POSTFIX=$JOB_ID
    export CPUS=${CPUS:-192}
    bootstrap_ec2 "./bootstrap.sh ci-grind-test $(printf %q "$full_cmd") $timeout $jobs_pct $memsuspend_pct $commit" | DUP=1 cache_log "Grind test CI run" $RUN_ID
    ;;
  ##########################################
  # NETWORK DEPLOYMENTS WITH BENCHES/TESTS #
  ##########################################
  network-scenarios)
    # Args: <scenario> <namespace> [docker_image] [test_set]
    # If test_set provided, run just that set. Otherwise run both in parallel.
    scenario="${1:?scenario is required}"
    namespace="${2:?namespace is required}"
    docker_image="${3:-}"
    test_set="${4:-}"

    export CI_DASHBOARD="network"
    # Enough for the build, which should have a lot of caching, and the test harness.
    # Resources are on GCP.
    export CPUS=16
    run() {
      local set=$1
      export JOB_ID="x-${namespace}-${set}"
      export INSTANCE_POSTFIX="n-deploy-${set}"
      bootstrap_ec2 "./bootstrap.sh ci-network-deploy $scenario ${namespace}-${set} \"$docker_image\" $set"
    }
    export -f run
    export scenario namespace docker_image

    if [[ -n "$test_set" ]]; then
      run "$test_set"
    else
      parallel --jobs 2 --line-buffered ::: 'run 1' 'run 2'
    fi
    ;;
  network-deploy)
    # Args: <scenario> <namespace> [docker_image]
    # If docker_image is not provided, ci-network-deploy will build and push to aztecdev.
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-deploy"
    export INSTANCE_POSTFIX="n-deploy"
    # Enough for the build, which should have a lot of caching, and the test harness.
    # Resources are on GCP.
    export CPUS=16
    bootstrap_ec2 "./bootstrap.sh ci-network-deploy $*"
    ;;
  network-tests)
    # Args: <scenario> <namespace>
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-tests"
    export AWS_SHUTDOWN_TIME=360 # 6 hours for network tests
    export INSTANCE_POSTFIX="n-tests"
    # Enough for the build, which should have a lot of caching, and the test harness.
    # Resources are on GCP.
    export CPUS=16
    bootstrap_ec2 "./bootstrap.sh ci-network-tests $*"
    ;;
  network-bench)
    # Args: <scenario> <namespace> [docker_image]
    # If docker_image is not provided, ci-network-bench will build and push to aztecdev.
    # Set SKIP_NETWORK_DEPLOY=1 to run against an existing network.
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-bench"
    export INSTANCE_POSTFIX="n-bench"
    # Enough for the build, which should have a lot of caching, and the test harness.
    # Resources are on GCP.
    export CPUS=16
    skip_network_deploy=0
    [ "${SKIP_NETWORK_DEPLOY:-0}" = "1" ] && skip_network_deploy=1
    bootstrap_ec2 "SKIP_NETWORK_DEPLOY=$skip_network_deploy ./bootstrap.sh ci-network-bench $*"
    ;;
  network-proving-bench)
    # Args: <scenario> <namespace> [docker_image]
    # Deploys network and runs proving benchmarks. Set SKIP_NETWORK_DEPLOY=1 to run against an existing network.
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-proving-bench" CPUS=16
    export INSTANCE_POSTFIX="n-proving-bench"
    skip_network_deploy=0
    [ "${SKIP_NETWORK_DEPLOY:-0}" = "1" ] && skip_network_deploy=1
    bootstrap_ec2 "BENCH_SWEEP_ID=${BENCH_SWEEP_ID:-} BENCH_SWEEP_LABEL=${BENCH_SWEEP_LABEL:-} BENCH_BENCHMARK_TYPE=${BENCH_BENCHMARK_TYPE:-} SKIP_NETWORK_DEPLOY=$skip_network_deploy ./bootstrap.sh ci-network-proving-bench $*"
    ;;
  network-block-capacity-bench)
    # Args: <scenario> <namespace> [docker_image]
    # Deploys network and runs block capacity benchmarks. Set SKIP_NETWORK_DEPLOY=1 to run against an existing network.
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-block-capacity-bench" CPUS=16
    export INSTANCE_POSTFIX="n-block-cap-bench"
    skip_network_deploy=0
    [ "${SKIP_NETWORK_DEPLOY:-0}" = "1" ] && skip_network_deploy=1
    bootstrap_ec2 "SKIP_NETWORK_DEPLOY=$skip_network_deploy ./bootstrap.sh ci-network-block-capacity-bench $*"
    ;;
  network-bench-10tps)
    # Args: <scenario> <namespace> [docker_image]
    # Deploys the bench-10tps network and runs the 10-min 10 TPS benchmark.
    # Set SKIP_NETWORK_DEPLOY=1 to run against an existing network.
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-bench-10tps" CPUS=16
    export AWS_SHUTDOWN_TIME=${AWS_SHUTDOWN_TIME:-180}
    export INSTANCE_POSTFIX="n-bench-10tps"
    skip_network_deploy=0
    [ "${SKIP_NETWORK_DEPLOY:-0}" = "1" ] && skip_network_deploy=1
    bootstrap_ec2 "SKIP_NETWORK_DEPLOY=$skip_network_deploy ./bootstrap.sh ci-network-bench-10tps $*"
    ;;
  network-inclusion-sweep)
    # Args: <env_file> <namespace> [docker_image]
    # Runs one inclusion-sweep point at TARGET_TPS against an existing
    # network, tagged with BENCH_SWEEP_ID. The workflow deploys/tears down each
    # point's namespace separately, so this is normally called with
    # SKIP_NETWORK_DEPLOY=1. TARGET_TPS / BENCH_SWEEP_ID / BENCH_SWEEP_LABEL come
    # from the caller's env and are threaded into the remote command.
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-inclusion-sweep" CPUS=16
    export AWS_SHUTDOWN_TIME=${AWS_SHUTDOWN_TIME:-180}
    export INSTANCE_POSTFIX="n-incl-sweep"
    skip_network_deploy=0
    [ "${SKIP_NETWORK_DEPLOY:-0}" = "1" ] && skip_network_deploy=1
    bootstrap_ec2 "TARGET_TPS=${TARGET_TPS:-10} BENCH_SWEEP_ID=${BENCH_SWEEP_ID:-} BENCH_SWEEP_LABEL=${BENCH_SWEEP_LABEL:-inclusion-sweep} SKIP_NETWORK_DEPLOY=$skip_network_deploy ./bootstrap.sh ci-network-inclusion-sweep $*"
    ;;
  network-teardown)
    # Args: <scenario> <namespace>
    export CI_DASHBOARD="network"
    export JOB_ID="x-${2:?namespace is required}-network-teardown"
    export CPUS=4
    export INSTANCE_POSTFIX="n-teardown"
    bootstrap_ec2 "./bootstrap.sh ci-network-teardown $*"
    ;;

  network-tests-kind)
    # Runs KIND-based spartan tests on a 192 CPU instance.
    export CI_DASHBOARD="network"
    export JOB_ID="x-network-kind"
    export AWS_SHUTDOWN_TIME=180 # 3 hours for KIND tests
    export CPUS=192
    export INSTANCE_POSTFIX="n-kind"
    bootstrap_ec2 "./bootstrap.sh ci-network-kind-tests"
    ;;
  deploy-rollup-upgrade)
    # Env vars: NETWORK, GCP_PROJECT_ID (for GCP secrets)
    # Args: <registry_address>
    export CI_DASHBOARD="network"
    export JOB_ID="x-deploy-rollup-upgrade"
    export CPUS=8
    export INSTANCE_POSTFIX="rollup-upgrade"
    bootstrap_ec2 "./bootstrap.sh ci-deploy-rollup-upgrade $*"
    ;;

  ############
  # RELEASES #
  ############
  release)
    # Spin up ec2 instances (amd64 + arm64) and run the full release flow: backwards-compat e2e
    # checks, build, and publish. Set DRY_RUN=1 to exercise the whole flow without publishing.
    export CI_DASHBOARD="releases"
    # Roomier instance lifetime than a standard run: the amd64 job builds, runs the backwards-compat
    # e2e suite, and then publishes, which together exceed the default 75 min shutdown.
    export AWS_SHUTDOWN_TIME=${AWS_SHUTDOWN_TIME:-180}
    multi_job_run \
      'x-release amd64 ci-release' \
      'a-release arm64 ci-release'
    ;;
  ci-private-release)
    # Run the private release flow LOCALLY (no EC2): dry-run every project except release-image, then
    # publish release-image for real to the internal GCP Artifact Registry. Override
    # INTERNAL_DOCKER_REGISTRY / GOOGLE_APPLICATION_CREDENTIALS as needed; SKIP_BUILD=1 reuses a build.
    export INTERNAL_DOCKER_REGISTRY=${INTERNAL_DOCKER_REGISTRY:-us-west1-docker.pkg.dev/testnet-440309/aztec}
    # Default to the local SA key if no GCP creds are set (a no-op in CI, where GCP_SA_KEY is used).
    [ -z "${GCP_SA_KEY:-}" ] && [ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ] && [ -f "$HOME/sa.json" ] && \
      export GOOGLE_APPLICATION_CREDENTIALS="$HOME/sa.json"
    ./bootstrap.sh ci-private-release
    ;;

  ##################
  # SHELL SESSIONS #
  ##################
  shell-new)
    # Spin up ec2 instance, clone, and drop into shell.
    # False triggers the shell on fail.
    cmd="${1:-false}"
    CI_USE_SSH=1 exec bootstrap_ec2 "$cmd"
    ;;
  shell-container)
    # Drop into a zsh shell in a running build instance's container. Optional filter
    # tokens select the instance, e.g.:
    #   ci.sh shell-container                 # the current branch's instance
    #   ci.sh shell-container pr-12345 bench  # the bench box for that merge-queue run
    #   ci.sh shell-container pr-12345 arm64  # the arm build of that run
    resolve_instance "$@"
    container_cmd="docker start aztec_build &>/dev/null || true && docker exec -it --user aztec-dev aztec_build zsh"
    if [ "${CI_USE_SSH:-0}" -eq 1 ]; then
      if [ -z "$ip" ] || [ "$ip" = "None" ]; then echo_stderr "No public IP for $resolved_name."; exit 1; fi
      ssh -tq -F $ci3/aws/build_instance_ssh_config ubuntu@$ip "$container_cmd"
    else
      # SSM sessions run as the non-root ssm-user (which has passwordless sudo), so
      # use sudo rather than runuser. Running docker as root is fine — the container
      # itself drops to aztec-dev via --user.
      aws ssm start-session \
        --region us-east-2 \
        --target "$iid" \
        --document-name "AWS-StartInteractiveCommand" \
        --parameters "{\"command\":[\"sudo bash -c '$container_cmd'\"]}"
    fi
    ;;
  shell-host)
    # Drop into a shell on a running build host. Optional filter tokens select the
    # instance (see shell-container).
    resolve_instance "$@"
    if [ "${CI_USE_SSH:-0}" -eq 1 ]; then
      if [ -z "$ip" ] || [ "$ip" = "None" ]; then echo_stderr "No public IP for $resolved_name."; exit 1; fi
      ssh -t -F $ci3/aws/build_instance_ssh_config ubuntu@$ip
    else
      aws ssm start-session \
        --region us-east-2 \
        --target "$iid"
    fi
    ;;
  kill)
    # Terminate ALL running build instances matching the filter tokens (default: the
    # current branch). E.g. `ci.sh kill pr-12345` ends a whole merge-queue run.
    kill_rows=$(filter_build_instances "$@")
    if [ -z "$kill_rows" ]; then
      echo "No running build instance matches: ${*:-$BRANCH}"
      exit 0
    fi
    echo "Terminating:"
    printf '%s\n' "$kill_rows" | awk '{print "  " $1 " (" $2 ")"}'
    printf '%s\n' "$kill_rows" | awk '{print $2}' | xargs aws ec2 terminate-instances --region us-east-2 --instance-ids >/dev/null
    ;;

  ###################
  # DISPLAYING LOGS #
  ###################
  log|dlog)
    pager=${PAGER:-less}
    [ ! -t 0 ] && pager=cat
    key=$1
    # Handle list/* URLs or history_* keys (Redis LISTs, not strings)
    if [[ "$key" == list/* ]]; then
      key=${key#list/}
    fi
    if [[ "$key" == history_* || "$key" == failed_tests* ]]; then
      if [ "$CI_REDIS_AVAILABLE" -ne 1 ]; then
        echo "No redis available for list log query."
        exit 1
      fi
      redis_cli LRANGE "$key" 0 -1 | $pager
    elif [ "$CI_REDIS_AVAILABLE" -eq 1 ]; then
      redis_getz "$key" | $pager
    else
      if [ -z "${CI_PASSWORD:-}" ]; then
        echo "No redis available and CI_PASSWORD not set for http fallback."
        exit 1
      fi
      curl -sf "http://aztec:$CI_PASSWORD@ci.aztec-labs.com/$key.txt" | $pager
      if [ ${PIPESTATUS[0]} -ne 0 ]; then
        echo "Failed to fetch log via http."
        exit 1
      fi
    fi
    ;;

  test-timings)
    # Download all per-test timing files for a CI job and gunzip them into a folder.
    # ci_log_id is the job's top-level log id (the decimal id in its ci.aztec-labs.com URL).
    # Each downloaded file is named after the test's individual log id (ci.aztec-labs.com/<log_id>).
    # Usage: ./ci.sh test-timings <ci_log_id> <folder>
    ci_log_id="${1:-}"
    folder="${2:-}"
    if [ -z "$ci_log_id" ] || [ -z "$folder" ]; then
      echo "usage: $(basename $0) test-timings <ci_log_id> <folder>"
      exit 1
    fi
    mkdir -p "$folder"
    aws ${S3_BUILD_CACHE_AWS_PARAMS:-} s3 cp --recursive \
      "s3://aztec-ci-artifacts/logs/test-timings/${ci_log_id}/" "$folder/"
    for f in "$folder"/*.log.gz; do
      [ -e "$f" ] || continue
      out="${f%.log.gz}.jsonl"
      gunzip -c "$f" > "$out"
      rm -f "$f"
    done
    echo "Downloaded test timings for job $ci_log_id into $folder/"
    ;;

  #################
  # PR MANAGEMENT #
  #################
  draft)
    pr_number=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    if [ -n "$pr_number" ]; then
      gh pr ready "$pr_number" --undo
      echo "Pull request #$pr_number has been set to draft."
    else
      echo "No pull request found for branch $BRANCH."
    fi
    ;;
  ready)
    pr_number=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number')
    if [ -n "$pr_number" ]; then
      gh pr ready "$pr_number"
      echo "Pull request #$pr_number has been set to ready."
    else
      echo "No pull request found for branch $BRANCH."
    fi
    ;;
  pr-url)
    # Print the current PR associated with the branch.
    pr_url=$(gh pr list --head "$BRANCH" --limit 1 --json url -q '.[0].url')
    if [ -z "$pr_url" ]; then
      echo "No pull request found for branch '$BRANCH'."
      exit 1
    fi
    echo "$pr_url"
    ;;

  ########################
  # BENCHMARK PROCESSING #
  ########################
  gh-bench|gh-deploy-bench|gh-spartan-bench|gh-spartan-proving-bench|gh-spartan-block-capacity-bench)
    cache_download ${cmd#gh-}-$(git rev-parse HEAD^{tree}).tar.gz
    ;;

  help|"")
    print_usage
    ;;
  *)
    echo "Unknown command: $cmd, see ./ci.sh help"
    exit 1
    ;;
esac
