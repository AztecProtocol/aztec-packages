#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
export CRS_PATH=$HOME/.bb-crs
native_build_dir=$(../cpp/scripts/native-preset-build-dir)
export bb=$(realpath ../cpp/$native_build_dir/bin/bb)

tests_tar=barretenberg-acir-tests-$(hash_str \
  $(../../noir/bootstrap.sh hash-tests) \
  $(cache_content_hash \
    ./.rebuild_patterns \
    ../cpp/.rebuild_patterns \
    ../noir/ \
    )).tar.gz

tests_hash=$(hash_str \
  $(../../noir/bootstrap.sh hash-tests) \
  $(cache_content_hash \
    ^barretenberg/acir_tests/ \
    ./.rebuild_patterns \
    ../cpp/.rebuild_patterns \
    ../ts/.rebuild_patterns \
    ../noir/))

# Generate inputs for a given recursively verifying program.
function run_proof_generation {
  local program=$1
  local outdir=$(mktemp -d)
  trap "rm -rf $outdir" EXIT
  local adjustment=16
  local ipa_accumulation_flag=""

  cd ./acir_tests/assert_statement
  # we add a variable to track whether we are disabling zk for the test or not.
  local disable_zk="--disable_zk"

  # Adjust settings based on program type
  if [[ $program == *"rollup"* ]]; then
      adjustment=26
      ipa_accumulation_flag="--ipa_accumulation"
  fi
  # If the test program has zk in it's name would like to use the zk prover, so we empty the flag in this case.
  if [[ $program == *"zk"* ]]; then
    disable_zk=""
  fi
  local prove_cmd="$bb prove --scheme ultra_honk $disable_zk --init_kzg_accumulator $ipa_accumulation_flag --output_format fields --write_vk -o $outdir -b ./target/program.json -w ./target/witness.gz"
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
  parallel 'run_proof_generation {}' ::: "double_verify_honk_proof" "verify_honk_proof" "verify_rollup_honk_proof"
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
    # These are breaking with:
    # Failed to solve program: 'Failed to solve blackbox function: embedded_curve_add, reason: Infinite input: embedded_curve_add(infinity, infinity)'
    rm -rf acir_tests/{regression_5045,regression_7744}
    # Merge the internal test programs with the acir tests.
    cp -R ./internal_test_programs/* acir_tests

    # Generates the Prover.toml files for the recursive tests from the assert_statement test.
    denoise regenerate_recursive_inputs

    # COMPILE=2 only compiles the test.
    denoise "parallel --joblog joblog.txt --line-buffered 'COMPILE=2 ./scripts/run_test.sh \$(basename {})' ::: ./acir_tests/*"

    cache_upload $tests_tar acir_tests
  fi

  npm_install_deps

  parallel --line-buffer --tag --halt now,fail=1 'cd {} && denoise "yarn build"' ::: browser-test-app bbjs-test
}

function test {
  echo_header "acir_tests testing"
  test_cmds | filter_test_cmds | parallelise
}

# Prints to stdout, one per line, the command to execute each individual test.
# Paths are all relative to the repository root.
# this function is used to generate the commands for running the tests.
function test_cmds {
  # non_recursive_tests include all of the non recursive test programs
  local non_recursive_tests=$(find ./acir_tests -maxdepth 1 -mindepth 1 -type d | \
    grep -vE 'verify_honk_proof|verify_honk_zk_proof|verify_rollup_honk_proof')
  local run_test=$(realpath --relative-to=$root ./scripts/run_test.sh)
  local run_test_browser=$(realpath --relative-to=$root ./scripts/run_test_browser.sh)
  local bbjs_bin="../ts/dest/node/main.js"

  # Solidity tests. Isolate because anvil.
  local prefix="$tests_hash:ISOLATE=1"
  echo "$prefix FLOW=sol_honk $run_test assert_statement"
  echo "$prefix FLOW=sol_honk $run_test a_1_mul"
  echo "$prefix FLOW=sol_honk $run_test slices"
  echo "$prefix FLOW=sol_honk $run_test verify_honk_proof"
  echo "$prefix FLOW=sol_honk_zk $run_test assert_statement"
  echo "$prefix FLOW=sol_honk_zk $run_test a_1_mul"
  echo "$prefix FLOW=sol_honk_zk $run_test slices"
  echo "$prefix FLOW=sol_honk_zk $run_test verify_honk_proof"

  # bb.js browser tests. Isolate because server.
  local prefix="$tests_hash:ISOLATE=1:NET=1:CPUS=8"
  echo "$prefix:NAME=chrome_verify_honk_proof BROWSER=chrome $run_test_browser verify_honk_proof"
  echo "$prefix:NAME=chrome_a_1_mul BROWSER=chrome $run_test_browser a_1_mul"
  echo "$prefix:NAME=webkit_verify_honk_proof BROWSER=webkit $run_test_browser verify_honk_proof"
  echo "$prefix:NAME=webkit_a_1_mul BROWSER=webkit $run_test_browser a_1_mul"

  # bb.js tests.
  local prefix=$tests_hash
  # ecdsa_secp256r1_3x through bb.js on node to check 256k support.
  echo "$prefix BIN=$bbjs_bin SYS=ultra_honk_deprecated FLOW=prove_then_verify $run_test ecdsa_secp256r1_3x"
  # the prove then verify flow for UltraHonk. This makes sure we have the same circuit for different witness inputs.
  echo "$prefix BIN=$bbjs_bin SYS=ultra_honk_deprecated FLOW=prove_then_verify $run_test a_6_array"

  # barretenberg-acir-tests-bb:
  # Fold and verify an ACIR program stack using ClientIVC, recursively verify as part of the Tube circuit and produce and verify a Honk proof
  echo "$prefix FLOW=prove_then_verify_tube $run_test a_6_array"

  # barretenberg-acir-tests-bb-ultra-honk:
  # SYS decides which scheme will be used for the test.
  # FLOW decides which script (prove, verify, prove_then_verify, etc.) will be ran
  for t in $non_recursive_tests; do
    echo "$prefix SYS=ultra_honk FLOW=prove_then_verify $run_test $(basename $t)"
  done
  echo "$prefix SYS=ultra_honk FLOW=prove_then_verify $run_test assert_statement"
  # Run the UH recursive verifier tests with ZK.
  echo "$prefix SYS=ultra_honk FLOW=prove_then_verify $run_test verify_honk_proof"
  echo "$prefix SYS=ultra_honk FLOW=prove_then_verify $run_test double_verify_honk_proof"
  # Run the UH recursive verifier tests without ZK.
  echo "$prefix SYS=ultra_honk FLOW=prove_then_verify DISABLE_ZK=true $run_test double_verify_honk_proof"
  # Run the ZK UH recursive verifier tests.
  echo "$prefix SYS=ultra_honk FLOW=prove_then_verify $run_test double_verify_honk_zk_proof"
  # Run the ZK UH recursive verifier tests without ZK.
  echo "$prefix SYS=ultra_honk FLOW=prove_then_verify DISABLE_ZK=true $run_test double_verify_honk_zk_proof"

  echo "$prefix SYS=ultra_honk FLOW=prove_then_verify HASH=keccak $run_test assert_statement"
  # echo "$prefix SYS=ultra_honk FLOW=prove_then_verify HASH=starknet $run_test assert_statement"
  echo "$prefix SYS=ultra_honk FLOW=prove_then_verify ROLLUP=true $run_test verify_rollup_honk_proof"
  # Run the assert_statement test with the --disable_zk flag.
  echo "$prefix SYS=ultra_honk FLOW=prove_then_verify DISABLE_ZK=true $run_test assert_statement"

  # prove and verify using bb.js classes
  echo "$prefix SYS=ultra_honk FLOW=bbjs_prove_verify $run_test a_1_mul"
  echo "$prefix SYS=ultra_honk FLOW=bbjs_prove_verify $run_test assert_statement"

  # prove with bb.js and verify with solidity verifier
  echo "$prefix SYS=ultra_honk FLOW=bbjs_prove_sol_verify $run_test a_1_mul"
  echo "$prefix SYS=ultra_honk FLOW=bbjs_prove_sol_verify $run_test assert_statement"

  # prove with bb cli and verify with bb.js classes
  echo "$prefix SYS=ultra_honk FLOW=bb_prove_bbjs_verify $run_test a_1_mul"
  echo "$prefix SYS=ultra_honk FLOW=bb_prove_bbjs_verify $run_test assert_statement"

  # prove with bb.js and verify with bb cli
  echo "$prefix SYS=ultra_honk FLOW=bbjs_prove_bb_verify $run_test a_1_mul"
  echo "$prefix SYS=ultra_honk FLOW=bbjs_prove_bb_verify $run_test assert_statement"
}

function bench_cmds {
  echo "$tests_hash:CPUS=16 barretenberg/acir_tests/scripts/run_bench.sh ultra_honk_rec_wasm_memory" \
    "'BIN=../ts/dest/node/main.js SYS=ultra_honk_deprecated FLOW=prove_then_verify ./scripts/run_test.sh verify_honk_proof'"
}

# TODO(https://github.com/AztecProtocol/barretenberg/issues/1254): More complete testing, including failure tests
function bench {
  rm -rf bench-out && mkdir -p bench-out
  bench_cmds | STRICT_SCHEDULING=1 parallelise
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
  test|test_cmds|bench|bench_cmds)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
