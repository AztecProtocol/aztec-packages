#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(../bootstrap.sh hash)
bench_fixtures_dir=example-app-ivc-inputs-out
default_avm_inputs_dump_dir=dumped-avm-circuit-inputs

# Helper function to extract test names from a test file
function extract_test_names {
	local test_file="$1"
	grep -oP "(it|test)\s*\(\s*['\"].*?['\"]" "$test_file" |
		sed -E "s/(it|test)\s*\(\s*['\"](.+)['\"]/\2/"
}

# Helper to generate DUMP_AVM_INPUTS_TO_DIR env var setting for a test (empty if not dumping)
function set_dump_avm {
	[ -n "${DUMP_AVM_INPUTS_TO_DIR:-}" ] && echo "DUMP_AVM_INPUTS_TO_DIR=${DUMP_AVM_INPUTS_TO_DIR}/$1"
}

function test_cmds {
	local run_test_script="yarn-project/end-to-end/scripts/run_test.sh"
	local prefix="$hash:ISOLATE=1"

	# Longest-running tests first
	# Can't run full prover tests on ARM because AVM is disabled.
	#if ../../barretenberg/cpp/bootstrap.sh hash | grep -qE no-avm; then
	#	if [ "$CI_FULL" -eq 1 ]; then
	#		echo "$prefix:TIMEOUT=20m:CPUS=16:MEM=96g:NAME=e2e_prover_client_real $run_test_script simple e2e_prover/client"
	#	else
	#		echo "$prefix:NAME=e2e_prover_client_fake FAKE_PROOFS=1 $run_test_script simple e2e_prover/client"
	#	fi
	#else
	#	if [ "$CI_FULL" -eq 1 ]; then
	#		echo "$prefix:TIMEOUT=20m:CPUS=16:MEM=96g:NAME=e2e_prover_full_real $run_test_script simple e2e_prover/full"
	#	else
	#		echo "$prefix:NAME=e2e_prover_full_fake FAKE_PROOFS=1 $run_test_script simple e2e_prover/full"
	#	fi
	#fi

	echo "$prefix:TIMEOUT=15m:NAME=e2e_block_building $(set_dump_avm e2e_block_building) $run_test_script simple e2e_block_building"

	#local tests=(
	#	# List all standalone and nested tests, except for the ones listed above.
	#	src/e2e_!(prover)/*.test.ts
	#	src/e2e_!(block_building).test.ts
	#)

	#for test in "${tests[@]}"; do
	#	local name=${test#*e2e_}
	#	name=e2e_${name%.test.ts}

	#	# Check if this is a .parallel.test.ts file
	#	if [[ "$test" == *.parallel.test.ts ]]; then
	#		# Extract individual test names and create a command for each
	#		while IFS= read -r test_name; do
	#			# Create a safe name for the individual test (replace spaces with underscores)
	#			local safe_test_name=$(echo "$test_name" | sed 's/ /_/g')
	#			local full_name="${name}_${safe_test_name}"
	#			echo "$prefix:NAME=$full_name $(set_dump_avm $full_name) $run_test_script simple $test \"$test_name\""
	#		done < <(extract_test_names "$test")
	#	else
	#		# Regular test file - run the whole file
	#		echo "$prefix:NAME=$name $(set_dump_avm $name) $run_test_script simple $test"
	#	fi
	#done

	## compose-based tests (use running local network)
	#tests=(
	#  src/composed/!(integration_proof_verification|e2e_persistence).test.ts
	#  src/guides/*.test.ts
	#)
	#for test in "${tests[@]}"; do
	#  # We must set ONLY_TERM_PARENT=1 to allow the script to fully control cleanup process.
	#  echo "$hash:ONLY_TERM_PARENT=1 $run_test_script compose $test"
	#done

	#tests=(
	#  src/composed/web3signer/*.test.ts
	#)
	#for test in "${tests[@]}"; do
	#  # We must set ONLY_TERM_PARENT=1 to allow the script to fully control cleanup process.
	#  echo "$hash:ONLY_TERM_PARENT=1 $run_test_script web3signer $test"
	#done

	##echo "$hash:ONLY_TERM_PARENT=1 $run_test_script simple src/e2e_multi_validator/e2e_multi_validator_node.test.ts"
	##echo "$hash:ONLY_TERM_PARENT=1 $run_test_script web3signer src/composed/web3signer/integration_remote_signer.test.ts"
	##echo "$hash:ONLY_TERM_PARENT=1 $run_test_script web3signer src/e2e_multi_validator/e2e_multi_validator_node_key_store.test.ts"

	## compose-based tests with custom scripts
	#for flow in ../cli-wallet/test/flows/*.sh; do
	#  # Note these scripts are ran directly by docker-compose.yml because it ends in '.sh'.
	#  # Set LOG_LEVEL=info for a better output experience. Deeper debugging should happen with other e2e tests.
	#  echo "$hash:ONLY_TERM_PARENT=1 LOG_LEVEL=info $run_test_script compose $flow"
	#done
}

function test {
	echo_header "e2e tests"
	test_cmds | filter_test_cmds | parallelize
}

function bench_cmds {
	echo "$hash:ISOLATE=1:NAME=bench_build_block BENCH_OUTPUT=bench-out/build-block.bench.json yarn-project/end-to-end/scripts/run_test.sh simple bench_build_block"
	echo "$hash:ISOLATE=1:CPUS=8:NAME=tx_stats BB_IVC_CONCURRENCY=1 BB_NUM_IVC_VERIFIERS=8 BENCH_OUTPUT=bench-out/tx_stats.bench.json yarn-project/end-to-end/scripts/run_test.sh simple tx_stats_bench"

	for client_flow in client_flows/bridging client_flows/deployments client_flows/amm client_flows/account_deployments client_flows/transfers; do
		echo "$hash:ISOLATE=1:CPUS=8:NAME=$client_flow BENCHMARK_CONFIG=key_flows LOG_LEVEL=error BENCH_OUTPUT=bench-out/ yarn-project/end-to-end/scripts/run_test.sh simple $client_flow"
	done

	for dir in $bench_fixtures_dir/*; do
		for runtime in native wasm; do
			echo "$hash:CPUS=8 barretenberg/cpp/scripts/ci_benchmark_ivc_flows.sh $runtime ../../yarn-project/end-to-end/$dir"
		done
	done
	echo "$hash:ISOLATE=1:NET=1:CPUS=8 barretenberg/cpp/scripts/ci_benchmark_browser_memory.sh ../../yarn-project/end-to-end/example-app-ivc-inputs-out/ecdsar1+transfer_0_recursions+sponsored_fpc"
}

# Builds the benchmark fixtures.
function build_bench {
	export CAPTURE_IVC_FOLDER=$bench_fixtures_dir
	export BENCHMARK_CONFIG=key_flows
	export LOG_LEVEL=error
	export ENV_VARS_TO_INJECT="BENCHMARK_CONFIG CAPTURE_IVC_FOLDER LOG_LEVEL"
	rm -rf $CAPTURE_IVC_FOLDER && mkdir -p $CAPTURE_IVC_FOLDER
	rm -rf bench-out && mkdir -p bench-out
	if cache_download bb-chonk-captures-$hash.tar.gz; then
		return
	fi
	parallel --tag --line-buffer --halt now,fail=1 'docker_isolate "scripts/run_test.sh simple {}"' ::: \
		client_flows/account_deployments \
		client_flows/deployments \
		client_flows/bridging \
		client_flows/transfers \
		client_flows/amm
	cache_upload bb-chonk-captures-$hash.tar.gz $CAPTURE_IVC_FOLDER
}

function bench {
	rm -rf bench-out
	mkdir -p bench-out
	bench_cmds | STRICT_SCHEDULING=1 parallelize
}

# Runs e2e tests with AVM circuit inputs dumping enabled, then packages and uploads them
function test_and_dump_avm_inputs {
	echo_header "e2e tests with AVM circuit inputs dumping"

	# Fail if dump directory already exists to avoid mixing/overwriting results
	if [ -d "$default_avm_inputs_dump_dir" ]; then
		echo_stderr "Error: Dump directory '$default_avm_inputs_dump_dir' already exists. Failing instead of overwriting."
		exit 1
	fi
	mkdir -p "$default_avm_inputs_dump_dir"

	# Set base dir for dumping - test_cmds will append test name subdirs
	export DUMP_AVM_INPUTS_TO_DIR="$default_avm_inputs_dump_dir"

	# Run tests in parallel (like regular test command)
	test_cmds | filter_test_cmds | parallelize

	# Create tarball of all dumped avm circuit inputs
	local tarball_name="e2e-avm-circuit-inputs-$hash.tar.gz"

	if [ -d "$default_avm_inputs_dump_dir" ] && [ "$(ls -A $default_avm_inputs_dump_dir 2>/dev/null)" ]; then
		echo_header "Packaging AVM circuit inputs"
		# Upload the tarball of all dumped avm circuit inputs
		cache_upload "$tarball_name" "$default_avm_inputs_dump_dir"
	else
		echo_stderr "Warning: No AVM circuit inputs were dumped. Skipping upload."
	fi

	unset DUMP_AVM_INPUTS_TO_DIR
}

# Generates commands to run avm_check_circuit on all dumped AVM circuit inputs
function avm_check_circuit_cmds {
	local bb_avm="barretenberg/cpp/build/bin/bb-avm"

	# Find all .bin files in the dump directory (handles nested dirs)
	for input_file in "$default_avm_inputs_dump_dir"/*/*.bin "$default_avm_inputs_dump_dir"/*/*/*.bin; do
		# Skip if no matches (glob didn't expand)
		[ -e "$input_file" ] || continue

		# Extract test name and tx hash for the command name
		# e.g., dumped-avm-circuit-inputs/e2e_block_building/avm-circuit-inputs-tx-0x1234.bin
		# -> avm_cc_e2e_block_building_0x1234
		local rel_path="${input_file#$default_avm_inputs_dump_dir/}"
		local test_dir=$(dirname "$rel_path")
		local filename=$(basename "$input_file" .bin)
		# Extract just the tx hash part (remove "avm-circuit-inputs-tx-" prefix)
		local tx_hash="${filename#avm-circuit-inputs-tx-}"
		# Shorten hash for readability
		local short_hash="${tx_hash:0:10}"
		# Create safe name (replace / with _)
		local safe_test_dir="${test_dir//\//_}"
		local name="avm_cc_${safe_test_dir}_${short_hash}"

		echo "$hash:NAME=$name $bb_avm avm_check_circuit --avm-inputs $input_file"
	done
}

# Downloads cached AVM circuit inputs and runs check-circuit on all of them
function avm_check_circuit {
	echo_header "AVM check-circuit on dumped inputs"

	local tarball_name="e2e-avm-circuit-inputs-$hash.tar.gz"

	# Download the cached tarball
	if ! cache_download "$tarball_name"; then
		echo_stderr "Error: Could not download AVM circuit inputs tarball '$tarball_name'"
		exit 1
	fi

	# Run check-circuit serially (1 job at a time) - avm is resource-intensive
	avm_check_circuit_cmds | parallelize 1
}

case "$cmd" in
*)
	default_cmd_handler "$@"
	;;
esac
