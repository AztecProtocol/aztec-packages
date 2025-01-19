#!/usr/bin/env bash
set -euo pipefail

#
# scripts/targets.sh
#
# A single entry script that replaces the old Earthly targets with
# shell functions. Usage:
#
#    scripts/targets.sh <command> [args...]
#
# Example:
#    scripts/targets.sh ci-noir-bb
#

# Utility: a simple function to echo usage and exit
usage() {
  cat <<EOF
Usage: $0 <command> [args...]

Available commands include:
  bootstrap
  ci-noir-bb
  ci-rest
  docs-with-cache
  barretenberg-acir-tests-bench-publish
  barretenberg-cpp-bench-binaries
  barretenberg-cpp-bench
  boxes-test
  prover-client-with-cache
  noir-projects-gates-report
  noir-projects-public-functions-report
  image-e2e
  # ... add or remove as needed

Examples:
  $0 bootstrap
  $0 ci-noir-bb
  $0 docs-with-cache staging 12345 <AZTEC_BOT_TOKEN> <NETLIFY_AUTH> <NETLIFY_SITE_ID>
EOF
  exit 1
}

##############################################
# Example: "bootstrap" target
##############################################
cmd_bootstrap() {
  echo "[cmd_bootstrap] Running the equivalent of '+bootstrap' Earthly target..."

  # Example logic from Earthfile:
  #  - we do 'noir' & 'barretenberg' builds
  #  - then L1, avm, noir-projects, yarn, boxes, etc.
  # Adjust to your real commands:
  echo " -> Starting 'noir/bootstrap.sh fast'"
  DENOISE=1 CI=1 ./noir/bootstrap.sh fast

  echo " -> Starting 'barretenberg/bootstrap.sh fast'"
  DENOISE=1 CI=1 ./barretenberg/bootstrap.sh fast

  echo " -> Starting 'l1-contracts/bootstrap.sh ci'"
  DENOISE=1 CI=1 ./l1-contracts/bootstrap.sh ci

  echo " -> Starting 'avm-transpiler/bootstrap.sh ci'"
  DENOISE=1 CI=1 ./avm-transpiler/bootstrap.sh ci

  echo " -> Starting 'noir-projects/bootstrap.sh ci'"
  DENOISE=1 CI=1 ./noir-projects/bootstrap.sh ci

  echo " -> Starting 'yarn-project/bootstrap.sh fast'"
  DENOISE=1 CI=1 ./yarn-project/bootstrap.sh fast

  echo " -> Starting 'boxes/bootstrap.sh fast'"
  DENOISE=1 CI=1 ./boxes/bootstrap.sh fast

  echo "[cmd_bootstrap] Done!"
}

##############################################
# Example: "ci-noir-bb" target
##############################################
cmd_ci_noir_bb() {
  echo "[cmd_ci_noir_bb] Running the old '+ci-noir-bb' Earthly logic..."

  # 1) This might do a "bootstrap-noir-bb" or rely on the step that
  #    ensures it is already done:
  echo " -> Checking noir changes / building noir projects..."
  # You can replicate the old logic from your Earthfile:
  # e.g. artifact check or "ci3/test_should_run" if you use your existing caching logic
  # For demonstration:
  ./noir/bootstrap.sh test

  # 2) Then build or test barretenberg
  echo " -> Checking barretenberg changes / building barretenberg with clang/gcc..."
  ./barretenberg/cpp/bootstrap.sh test

  echo "[cmd_ci_noir_bb] Done!"
}

##############################################
# Example: "ci-rest" target
##############################################
cmd_ci_rest() {
  echo "[cmd_ci_rest] Running the old '+ci-rest' Earthly logic..."

  echo " -> avm-transpiler checks..."
  DENOISE=1 CI=1 ./avm-transpiler/bootstrap.sh ci

  echo " -> l1-contracts checks..."
  DENOISE=1 CI=1 ./l1-contracts/bootstrap.sh ci

  echo " -> noir-projects checks..."
  DENOISE=1 CI=1 ./noir-projects/bootstrap.sh ci

  echo " -> yarn-project tests..."
  DENOISE=1 CI=1 ./yarn-project/bootstrap.sh test

  echo "[cmd_ci_rest] Done!"
}

##############################################
# Example: "docs-with-cache" target
##############################################
cmd_docs_with_cache() {
  local env="${1:-staging}"
  local pr="${2:-}"
  local gh_token="${3:-}"
  local netlify_auth="${4:-}"
  local netlify_site_id="${5:-}"

  echo "[cmd_docs_with_cache] Replacing Earthly target '+docs-with-cache'."
  echo " -> ENV=$env, PR=$pr, GH_TOKEN=$gh_token, NETLIFY_AUTH_TOKEN=$netlify_auth, NETLIFY_SITE_ID=$netlify_site_id"

  # In Earthly, you'd run: "scripts/earthly-ci +docs-with-cache --ENV=... --PR=..."
  # Now just do it inline:
  DENOISE=1 CI=1 USE_CACHE=1 ENV="$env" PR="$pr" \
    AZTEC_BOT_COMMENTER_GITHUB_TOKEN="$gh_token" \
    NETLIFY_AUTH_TOKEN="$netlify_auth" \
    NETLIFY_SITE_ID="$netlify_site_id" \
    ./docs/bootstrap.sh deploy-preview

  echo "[cmd_docs_with_cache] Done!"
}

##############################################
# Example: "barretenberg-acir-tests-bench-publish" target
##############################################
cmd_barretenberg_acir_tests_bench_publish() {
  echo "[cmd_barretenberg_acir_tests_bench_publish] Replacing Earthly target './barretenberg/acir_tests+bench-publish'..."

  # The old Earthfile steps:
  #  1) build/pull a Docker image
  #  2) run the bench_acir_tests.sh script
  #  3) upload logs
  # ...
  # Now do it inline in Bash:
  echo " -> Doing local build or run of bench_acir_tests.sh..."
  pushd barretenberg/acir_tests
  ./bootstrap.sh ci
  ./bench_acir_tests.sh
  popd

  # If you had uploading logs to S3 or aggregator:
  echo " -> Possibly upload logs to S3 here..."

  echo "[cmd_barretenberg_acir_tests_bench_publish] Done!"
}

##############################################
# Example: "barretenberg-cpp-bench-binaries" target
##############################################
cmd_barretenberg_cpp_bench_binaries() {
  echo "[cmd_barretenberg_cpp_bench_binaries] Replacing Earthly target 'barretenberg/cpp/+bench-binaries'..."

  # Example: build or pull the bench binaries container
  pushd barretenberg/cpp
  # Possibly do a specialized build for bench
  ./bootstrap.sh bench-binaries
  popd
  echo "[cmd_barretenberg_cpp_bench_binaries] Done!"
}

##############################################
# Example: "barretenberg-cpp-bench" target
##############################################
cmd_barretenberg_cpp_bench() {
  local mode="${1:-build}"
  echo "[cmd_barretenberg_cpp_bench] Earthly target 'barretenberg/cpp/+bench' with bench_mode=$mode..."
  pushd barretenberg/cpp
  ./bootstrap.sh bench "$mode"
  popd
  echo "[cmd_barretenberg_cpp_bench] Done!"
}

##############################################
# Example: "boxes-test" target
##############################################
cmd_boxes_test() {
  echo "[cmd_boxes_test] Replacing 'scripts/earthly-ci ./boxes/bootstrap.sh test-boxes'..."

  pushd boxes
  ./bootstrap.sh test-boxes
  popd

  echo "[cmd_boxes_test] Done!"
}

##############################################
# Example: "prover-client-with-cache" target
##############################################
cmd_prover_client_with_cache() {
  echo "[cmd_prover_client_with_cache] Replacing '+prover-client-with-cache' Earthly target..."
  # Example steps:
  ./yarn-project/prover-client/test.sh
}

##############################################
# Example: "noir-projects-gates-report" target
##############################################
cmd_noir_projects_gates_report() {
  echo "[cmd_noir_projects_gates_report] Replacing 'scripts/earthly-ci --artifact ./noir-projects/+gates-report/gates_report.json'..."

  pushd noir-projects
  ./bootstrap.sh gates-report
  popd
  echo "[cmd_noir_projects_gates_report] Done!"
}

##############################################
# Example: "noir-projects-public-functions-report" target
##############################################
cmd_noir_projects_public_functions_report() {
  echo "[cmd_noir_projects_public_functions_report] Replacing 'scripts/earthly-ci --artifact ./noir-projects/+public-functions-report/public_functions_report.json'..."

  pushd noir-projects
  ./bootstrap.sh public-functions-report
  popd
  echo "[cmd_noir_projects_public_functions_report] Done!"
}

##############################################
# Example: "image-e2e" target
##############################################
cmd_image_e2e() {
  echo "[cmd_image_e2e] Replacing './bootstrap.sh image-e2e' call..."

  # If in your old flow you had a top-level bootstrap.sh that handled image builds,
  # inline that or call it:
  ./bootstrap.sh image-e2e
}

##############################################
# Main dispatch
##############################################
COMMAND="${1:-}"
shift || true

echo "COMMAND IS $COMMAND"
# case "$COMMAND" in
#   bootstrap)
#     cmd_bootstrap "$@"
#     ;;
#   ci-noir-bb)
#     cmd_ci_noir_bb "$@"
#     ;;
#   ci-rest)
#     cmd_ci_rest "$@"
#     ;;
#   docs-with-cache)
#     cmd_docs_with_cache "$@"
#     ;;
#   barretenberg-acir-tests-bench-publish)
#     cmd_barretenberg_acir_tests_bench_publish "$@"
#     ;;
#   barretenberg-cpp-bench-binaries)
#     cmd_barretenberg_cpp_bench_binaries "$@"
#     ;;
#   barretenberg-cpp-bench)
#     cmd_barretenberg_cpp_bench "$@"
#     ;;
#   boxes-test)
#     cmd_boxes_test "$@"
#     ;;
#   prover-client-with-cache)
#     cmd_prover_client_with_cache "$@"
#     ;;
#   noir-projects-gates-report)
#     cmd_noir_projects_gates_report "$@"
#     ;;
#   noir-projects-public-functions-report)
#     cmd_noir_projects_public_functions_report "$@"
#     ;;
#   image-e2e)
#     cmd_image_e2e "$@"
#     ;;
#   *)
#     echo "ERROR: unknown command '$COMMAND'"
#     usage
#     ;;
# esac
