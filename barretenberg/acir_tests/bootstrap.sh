#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
export CRS_PATH=$HOME/.bb-crs
export bb=$(realpath ../cpp/build/bin/bb)

tests_tar=barretenberg-acir-tests-$(hash_str \
  $(../../noir/bootstrap.sh hash-tests) \
  $(cache_content_hash \
    ../cpp/.rebuild_patterns \
    )).tar.gz

tests_hash=$(hash_str \
  $(../../noir/bootstrap.sh hash-tests) \
  $(cache_content_hash \
    ^barretenberg/acir_tests/ \
    ../cpp/.rebuild_patterns \
    ../ts/.rebuild_patterns))

# Generate inputs for a given recursively verifying program.
function run_proof_generation {
  local program=$1
  local outdir=$(mktemp -d)
  trap "rm -rf $outdir" EXIT
  local adjustment=16
  local ipa_accumulation_flag=""

  cd ./acir_tests/assert_statement

  # Adjust settings based on program type
  if [[ $program == *"rollup"* ]]; then
      adjustment=26
      ipa_accumulation_flag="--ipa_accumulation"
  fi
  local prove_cmd="$bb prove --scheme ultra_honk --init_kzg_accumulator $ipa_accumulation_flag --output_format fields --write_vk -o $outdir -b ./target/program.json -w ./target/witness.gz"
  echo_stderr "$prove_cmd"
  dump_fail "$prove_cmd"

  local vk_fields=$(cat "$outdir/vk_fields.json")
  local public_inputs_fields=$(cat "$outdir/public_inputs_fields.json")
  local proof_fields=$(cat "$outdir/proof_fields.json")

  generate_toml "$program" "$vk_fields" "$proof_fields" "$public_inputs_fields"
}

function generate_toml {
  local program=$1
  local vk_fields=$2
  local proof_fields=$3
  local num_inner_public_inputs=$4
  local output_file="../$program/Prover.toml"
  local key_hash="0x0000000000000000000000000000000000000000000000000000000000000000"

  jq -nr \
      --arg key_hash "$key_hash" \
      --argjson vk_f "$vk_fields" \
      --argjson public_inputs_f "$public_inputs_fields" \
      --argjson proof_f "$proof_fields" \
      '[
        "key_hash = \($key_hash)",
        "proof = [\($proof_f | map("\"" + . + "\"") | join(", "))]",
        "public_inputs = [\($public_inputs_f | map("\"" + . + "\"") | join(", "))]",
        "verification_key = [\($vk_f | map("\"" + . + "\"") | join(", "))]"
        '"$( [[ $program == *"double"* ]] && echo ',"proof_b = [\($proof_f | map("\"" + . + "\"") | join(", "))]"' )"'
      ] | join("\n")' > "$output_file"
}

function regenerate_recursive_inputs {
  local program=$1
  # Compile the assert_statement test as it's used for the recursive tests.
  COMPILE=2 ./scripts/run_test.sh assert_statement
  parallel 'run_proof_generation {}' ::: $(ls internal_test_programs)
}

export -f regenerate_recursive_inputs run_proof_generation generate_toml

function build {
  echo_header "acir_tests build"

  if ! cache_download $tests_tar; then
    rm -rf acir_tests
    denoise "cd ../../noir/noir-repo/test_programs/execution_success && git clean -fdx"
    cp -R ../../noir/noir-repo/test_programs/execution_success acir_tests
    # Running these requires extra gluecode so they're skipped.
    rm -rf acir_tests/{diamond_deps_0,workspace,workspace_default_member,regression_7323}
    # Merge the internal test programs with the acir tests.
    cp -R ./internal_test_programs/* acir_tests

    # Generates the Prover.toml files for the recursive tests from the assert_statement test.
    denoise regenerate_recursive_inputs

    # COMPILE=2 only compiles the test.
    denoise "parallel --joblog joblog.txt --line-buffered 'COMPILE=2 ./scripts/run_test.sh \$(basename {})' ::: ./acir_tests/*"

    cache_upload $tests_tar acir_tests
  fi

  npm_install_deps ../ts/
  # TODO: Check if still needed.
  # denoise "cd browser-test-app && yarn add --dev @aztec/bb.js@portal:../../ts"

  # TODO: Revisit. Update yarn.lock so it can be committed.
  # Be lenient about bb.js hash changing, even if we try to minimize the occurrences.
  # denoise "cd browser-test-app && yarn add --dev @aztec/bb.js@portal:../../ts && yarn"
  # denoise "cd headless-test && yarn"
  # denoise "cd sol-test && yarn"

  denoise "cd browser-test-app && yarn build"

  denoise "cd bbjs-test && yarn build"
}

function test {
  echo_header "acir_tests testing"
  # TODO: 64 is bit of a magic number for CI/mainframe. Needs to work on lower hardware.
  test_cmds | filter_test_cmds | parallelise 64
}

function test_cmds {
  # Prefix the test hash on each command.
  test_cmds_internal | awk "{ print \"$tests_hash \" \$0 }"
}

# Prints to stdout, one per line, the command to execute each individual test.
# Paths are all relative to the repository root.
function test_cmds_internal {
  local plonk_tests=$(find ./acir_tests -maxdepth 1 -mindepth 1 -type d | \
    grep -vE 'verify_honk_proof|double_verify_honk_proof|verify_rollup_honk_proof|fold')
  local honk_tests=$(find ./acir_tests -maxdepth 1 -mindepth 1 -type d | \
    grep -vE 'single_verify_proof|double_verify_proof|double_verify_nested_proof|verify_rollup_honk_proof|fold')

  local run_test=$(realpath --relative-to=$root ./scripts/run_test.sh)
  local run_test_browser=$(realpath --relative-to=$root ./scripts/run_test_browser.sh)
  local bbjs_bin="../ts/dest/node/main.js"

  # barretenberg-acir-tests-sol:
  echo "docker_isolate 'FLOW=sol $run_test assert_statement'"
  echo "docker_isolate 'FLOW=sol $run_test double_verify_proof'"
  echo "docker_isolate 'FLOW=sol $run_test double_verify_nested_proof'"
  echo "docker_isolate 'FLOW=sol_honk $run_test assert_statement'"
  echo "docker_isolate 'FLOW=sol_honk $run_test 1_mul'"
  echo "docker_isolate 'FLOW=sol_honk $run_test slices'"
  echo "docker_isolate 'FLOW=sol_honk $run_test verify_honk_proof'"
  echo "docker_isolate 'FLOW=sol_honk_zk $run_test assert_statement'"
  echo "docker_isolate 'FLOW=sol_honk_zk $run_test 1_mul'"
  echo "docker_isolate 'FLOW=sol_honk_zk $run_test slices'"
  echo "docker_isolate 'FLOW=sol_honk_zk $run_test verify_honk_proof'"

  # barretenberg-acir-tests-bb.js:
  # Browser tests.
  echo BROWSER=chrome THREAD_MODEL=mt $run_test_browser verify_honk_proof
  echo BROWSER=chrome THREAD_MODEL=st $run_test_browser 1_mul
  echo BROWSER=webkit THREAD_MODEL=mt $run_test_browser verify_honk_proof
  echo BROWSER=webkit THREAD_MODEL=st $run_test_browser 1_mul
  # echo ecdsa_secp256r1_3x through bb.js on node to check 256k support.
  echo BIN=$bbjs_bin FLOW=prove_then_verify $run_test ecdsa_secp256r1_3x
  # echo the prove then verify flow for UltraHonk. This makes sure we have the same circuit for different witness inputs.
  echo BIN=$bbjs_bin SYS=ultra_honk_deprecated FLOW=prove_then_verify $run_test 6_array
  # echo 1_mul through bb.js build, all_cmds flow, to test all cli args.
  echo BIN=$bbjs_bin FLOW=all_cmds $run_test 1_mul

  # barretenberg-acir-tests-bb:
  # Fold and verify an ACIR program stack using ClientIVC, recursively verify as part of the Tube circuit and produce and verify a Honk proof
  echo FLOW=prove_then_verify_tube $run_test 6_array
  # echo 1_mul through native bb build, all_cmds flow, to test all cli args.
  echo NATIVE=1 FLOW=all_cmds $run_test 1_mul

  # barretenberg-acir-tests-bb-ultra-plonk:
  # Exclude honk tests.
  for t in $plonk_tests; do
    echo SYS=ultra_plonk_deprecated FLOW=prove_then_verify $run_test $(basename $t)
  done
  echo SYS=ultra_plonk_deprecated FLOW=prove_then_verify RECURSIVE=true $run_test assert_statement
  echo SYS=ultra_plonk_deprecated FLOW=prove_then_verify RECURSIVE=true $run_test double_verify_proof

  # barretenberg-acir-tests-bb-ultra-honk:
  # Exclude plonk tests.
  for t in $honk_tests; do
    echo SYS=ultra_honk FLOW=prove_then_verify $run_test $(basename $t)
  done
  echo SYS=ultra_honk FLOW=prove_then_verify $run_test assert_statement
  echo SYS=ultra_honk FLOW=prove_then_verify $run_test double_verify_honk_proof
  echo SYS=ultra_honk FLOW=prove_then_verify HASH=keccak $run_test assert_statement
  echo SYS=ultra_honk FLOW=prove_then_verify ROLLUP=true $run_test verify_rollup_honk_proof

  # prove and verify using bb.js classes
  echo SYS=ultra_honk FLOW=bbjs_prove_verify $run_test 1_mul
  echo SYS=ultra_honk FLOW=bbjs_prove_verify THREAD_MODEL=mt $run_test assert_statement

  # prove with bb.js and verify with solidity verifier
  echo SYS=ultra_honk FLOW=bbjs_prove_sol_verify $run_test 1_mul
  echo SYS=ultra_honk FLOW=bbjs_prove_sol_verify $run_test assert_statement

  # prove with bb cli and verify with bb.js classes
  echo SYS=ultra_honk FLOW=bb_prove_bbjs_verify $run_test 1_mul
  echo SYS=ultra_honk FLOW=bb_prove_bbjs_verify $run_test assert_statement

  # prove with bb.js and verify with bb cli
  echo SYS=ultra_honk FLOW=bbjs_prove_bb_verify $run_test 1_mul
  echo SYS=ultra_honk FLOW=bbjs_prove_bb_verify $run_test assert_statement
}

function ultra_honk_wasm_memory {
  VERBOSE=1 BIN=../ts/dest/node/main.js SYS=ultra_honk_deprecated FLOW=prove_then_verify \
    ./scripts/run_test.sh verify_honk_proof &> ./bench-out/ultra_honk_rec_wasm_memory.txt
}

function run_benchmark {
  local start_core=$(( ($1 - 1) * HARDWARE_CONCURRENCY ))
  local end_core=$(( start_core + (HARDWARE_CONCURRENCY - 1) ))
  echo taskset -c $start_core-$end_core bash -c "$2"
  taskset -c $start_core-$end_core bash -c "$2"
}

# TODO(https://github.com/AztecProtocol/barretenberg/issues/1254): More complete testing, including failure tests
function bench {
  # TODO(https://github.com/AztecProtocol/barretenberg/issues/1265) fix acir benchmarking
  # LOG_FILE=bench-acir.jsonl ./bench_acir_tests.sh

  export HARDWARE_CONCURRENCY=16

  rm -rf bench-out && mkdir -p bench-out
  export -f ultra_honk_wasm_memory run_benchmark
  local num_cpus=$(get_num_cpus)
  local jobs=$((num_cpus / HARDWARE_CONCURRENCY))
  parallel -v --line-buffer --tag --jobs "$jobs" run_benchmark {#} {} ::: \
    ultra_honk_wasm_memory
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "ci")
    build
    test
    ;;
  ""|"fast"|"full")
    build
    ;;
  "hash")
    echo $tests_hash
    ;;
  test|test_cmds|bench)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
