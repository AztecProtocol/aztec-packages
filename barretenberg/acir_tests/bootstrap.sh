#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
export CRS_PATH=$HOME/.bb-crs

tests_tar=barretenberg-acir-tests-$(hash_str \
  $(../../noir/bootstrap.sh hash-tests) \
  $(cache_content_hash \
    ./.rebuild_patterns \
    ../cpp/.rebuild_patterns \
    ../noir/ \
    )).tar.gz

tests_hash=$(hash_str \
  $(../../noir/bootstrap.sh hash-tests) \
  $(../cpp/bootstrap.sh hash) \
  $(cache_content_hash \
    ^barretenberg/acir_tests/ \
    ./.rebuild_patterns \
    ../ts/.rebuild_patterns \
    ../noir/))

# Generate inputs for a given recursively verifying program.
function run_proof_generation {
  local program=$1
  local native_build_dir=$(../cpp/scripts/native-preset-build-dir)
  local bb=$(realpath ../cpp/$native_build_dir/bin/bb)
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
  local prove_cmd="$bb prove --scheme ultra_honk $disable_zk $ipa_accumulation_flag --output_format fields --write_vk -o $outdir -b ./target/program.json -w ./target/witness.gz"
  echo_stderr "$prove_cmd"
  dump_fail "$prove_cmd"

  local vk_fields=$(cat "$outdir/vk_fields.json")
  local vk_hash_fields=$(cat "$outdir/vk_hash_fields.json")
  local public_inputs_fields=$(cat "$outdir/public_inputs_fields.json")
  local proof_fields=$(cat "$outdir/proof_fields.json")

  generate_toml "$program" "$vk_fields" "$vk_hash_fields" "$proof_fields" "$public_inputs_fields"
}

function generate_toml {
  local program=$1
  local vk_fields=$2
  local vk_hash_fields=$3
  local proof_fields=$4
  local num_inner_public_inputs=$5
  local output_file="../$program/Prover.toml"

  jq -nr \
      --arg key_hash "$vk_hash_fields" \
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
  cd ./acir_tests/assert_statement
  local nargo=$(realpath ../../../../noir/noir-repo/target/release/nargo)
  rm -rf target
  $nargo compile --silence-warnings && $nargo execute
  mv ./target/assert_statement.json ./target/program.json
  mv ./target/assert_statement.gz ./target/witness.gz
  cd ../..
  parallel 'run_proof_generation {}' ::: $(ls internal_test_programs)
}

export -f regenerate_recursive_inputs run_proof_generation generate_toml

function compile {
  echo_header "Compiling acir_tests"
  local nargo=$(realpath ../../noir/noir-repo/target/release/nargo)
  denoise "parallel --joblog joblog.txt --line-buffered 'cd {} && rm -rf target && $nargo compile --silence-warnings && $nargo execute && mv ./target/\$(basename {}).json ./target/program.json && mv ./target/\$(basename {}).gz ./target/witness.gz' ::: ./acir_tests/*"
}

function build {
  echo_header "acir_tests build"

  if ! cache_download $tests_tar; then
    rm -rf acir_tests
    denoise "cd ../../noir/noir-repo/test_programs/execution_success && git clean -fdx"
    cp -R ../../noir/noir-repo/test_programs/execution_success acir_tests
    # Running these requires extra gluecode so they're skipped.
    rm -rf acir_tests/{diamond_deps_0,workspace,workspace_default_member,regression_7323}

    rm -rf acir_tests/{ecdsa_secp256k1_invalid_pub_key_in_inactive_branch,ecdsa_secp256r1_invalid_pub_key_in_inactive_branch}
    # These are breaking with:
    # Failed to solve program: 'Failed to solve blackbox function: embedded_curve_add, reason: Infinite input: embedded_curve_add(infinity, infinity)'
    rm -rf acir_tests/{regression_5045,regression_7744}
    # Merge the internal test programs with the acir tests.
    cp -R ./internal_test_programs/* acir_tests

    # Generates the Prover.toml files for the recursive tests from the assert_statement test.
    denoise regenerate_recursive_inputs

    # Compile all tests
    compile
    cache_upload $tests_tar acir_tests
  fi

  npm_install_deps

  parallel --line-buffer --tag --halt now,fail=1 'cd {} && denoise "yarn build"' ::: browser-test-app bbjs-test
}

function test {
  echo_header "acir_tests testing"
  test_cmds | filter_test_cmds | parallelize
}

# Prints to stdout, one per line, the command to execute each individual test.
# Paths are all relative to the repository root.
# this function is used to generate the commands for running the tests.
function test_cmds {
  # NOTE: client-ivc commands are tested in yarn-project/end-to-end bench due to circular dependencies.
  # Locally, you can do ./bootstrap.sh bench_ivc to run the 'tests' (benches with validation)

  # non_recursive_tests include all of the non recursive test programs
  local non_recursive_tests=$(find ./acir_tests -maxdepth 1 -mindepth 1 -type d | \
    grep -vE 'verify_honk_proof|verify_honk_zk_proof|verify_rollup_honk_proof')
  local scripts=$(realpath --relative-to=$root scripts)

  local sol_prefix="$tests_hash:ISOLATE=1"
  # Solidity tests. Isolate because anvil.
  # Test the solidity verifier with and without zk
  for t in assert_statement a_1_mul slices verify_honk_proof; do
    echo "$sol_prefix $scripts/bb_prove_sol_verify.sh $t --disable_zk"
    echo "$sol_prefix $scripts/bb_prove_sol_verify.sh $t"
    echo "$sol_prefix $scripts/bb_prove_sol_verify.sh $t --optimized"
  done
  # prove with bb cli and verify with bb.js classes
  echo "$sol_prefix $scripts/bb_prove_bbjs_verify.sh a_1_mul"
  echo "$sol_prefix $scripts/bb_prove_bbjs_verify.sh assert_statement"

  # Solidity tests with optimized contract.
  echo "$prefix FLOW=sol_honk USE_OPTIMIZED_CONTRACT=true $run_test assert_statement"
  echo "$prefix FLOW=sol_honk USE_OPTIMIZED_CONTRACT=true $run_test a_1_mul"
  echo "$prefix FLOW=sol_honk USE_OPTIMIZED_CONTRACT=true $run_test slices"
  echo "$prefix FLOW=sol_honk USE_OPTIMIZED_CONTRACT=true $run_test verify_honk_proof"
  echo "$prefix FLOW=sol_honk USE_OPTIMIZED_CONTRACT=true $run_test double_verify_honk_proof"

  # bb.js browser tests. Isolate because server.
  local browser_prefix="$tests_hash:ISOLATE=1:NET=1:CPUS=8"
  echo "$browser_prefix:NAME=chrome_verify_honk_proof $scripts/browser_prove.sh verify_honk_proof chrome"
  echo "$browser_prefix:NAME=chrome_a_1_mul $scripts/browser_prove.sh a_1_mul chrome"
  echo "$browser_prefix:NAME=webkit_verify_honk_proof $scripts/browser_prove.sh verify_honk_proof webkit"
  echo "$browser_prefix:NAME=webkit_a_1_mul $scripts/browser_prove.sh a_1_mul webkit"

  # bb.js tests.
  # ecdsa_secp256r1_3x through bb.js on node to check 256k support.
  echo "$tests_hash $scripts/bbjs_prove.sh ecdsa_secp256r1_3x"
  # the prove then verify flow for UltraHonk. This makes sure we have the same circuit for different witness inputs.
  echo "$tests_hash $scripts/bbjs_prove.sh a_6_array"

  # Fold and verify an ACIR program stack using ClientIVC, recursively verify as part of the Tube circuit and produce and verify a Honk proof
  echo "$tests_hash $scripts/bb_tube_prove.sh a_6_array"

  for t in $non_recursive_tests; do
    echo "$tests_hash $scripts/bb_prove.sh $(basename $t)"
  done
  echo "$tests_hash $scripts/bb_prove.sh assert_statement"
  # Run the UH recursive verifier tests with ZK.
  echo "$tests_hash $scripts/bb_prove.sh verify_honk_proof"
  echo "$tests_hash $scripts/bb_prove.sh double_verify_honk_proof"
  # Run the UH recursive verifier tests without ZK.
  echo "$tests_hash $scripts/bb_prove.sh double_verify_honk_proof --disable_zk"
  # Run the ZK UH recursive verifier tests.
  echo "$tests_hash $scripts/bb_prove.sh double_verify_honk_zk_proof"
  # Run the ZK UH recursive verifier tests without ZK.
  echo "$tests_hash $scripts/bb_prove.sh double_verify_honk_zk_proof --disable_zk"

  echo "$tests_hash $scripts/bb_prove.sh assert_statement --oracle_hash keccak"
  # If starknet enabled:
  #echo "$tests_hash $scripts/bb_prove.sh assert_statement --oracle_hash starknet"
  # Test rollup verification (rollup uses --ipa_accumulation)
  echo "$tests_hash $scripts/bb_prove.sh verify_rollup_honk_proof --ipa_accumulation"
  # Run the assert_statement test with ZK disabled.
  echo "$tests_hash $scripts/bb_prove.sh assert_statement --disable_zk"

  # prove and verify using bb.js classes
  echo "$tests_hash $scripts/bbjs_prove.sh a_1_mul"
  echo "$tests_hash $scripts/bbjs_prove.sh assert_statement"

  # prove with bb.js and verify with bb cli
  echo "$tests_hash $scripts/bbjs_prove_bb_verify.sh a_1_mul"
  echo "$tests_hash $scripts/bbjs_prove_bb_verify.sh assert_statement"
}

function bench_cmds {
  local dir=$(realpath --relative-to=$root .)
  echo "$tests_hash:CPUS=16 barretenberg/acir_tests/scripts/run_bench.sh ultra_honk_rec_wasm_memory" \
    "'scripts/bbjs_legacy_cli_prove.sh verify_honk_proof'"
}

# TODO(https://github.com/AztecProtocol/barretenberg/issues/1254): More complete testing, including failure tests
function bench {
  rm -rf bench-out && mkdir -p bench-out
  bench_cmds | STRICT_SCHEDULING=1 parallelize
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
  "compile")
    compile
    ;;
  test|test_cmds|bench|bench_cmds)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
