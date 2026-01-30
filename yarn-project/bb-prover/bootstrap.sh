#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(../bootstrap.sh hash)

function test_cmds {
	local run_test_script="yarn-project/bb-prover/scripts/run_test.sh"
	local prefix="$hash:ISOLATE=1"

	# AVM Opcode Spam Full Proving - Heavy resource requirements
	# This test is normally skipped; RUN_AVM_OPCODE_SPAM=1 enables it
	echo "$prefix:TIMEOUT=60m:CPUS=32:MEM=128g:NAME=avm_opcode_spam_proving RUN_AVM_OPCODE_SPAM=1 $run_test_script src/avm_proving_tests/avm_opcode_spam.test.ts"
}

function test {
	echo_header "bb-prover avm proving tests"
	test_cmds | filter_test_cmds | parallelize
}

function spam_bench_cmds {
	local run_test_script="yarn-project/bb-prover/scripts/run_test.sh"
	local prefix="$hash:ISOLATE=1"

	# AVM Opcode Spam benchmarks with JSON output
	# SEED=42 ensures reproducible random values across runs
	echo "$prefix:TIMEOUT=180m:CPUS=32:MEM=128g:NAME=avm_opcode_spam_bench RUN_AVM_OPCODE_SPAM=1 SEED=42 BENCH_OUTPUT=bench-out/avm_opcode_spam.bench.json $run_test_script src/avm_proving_tests/avm_opcode_spam.test.ts"
}

function spam_bench {
	mkdir -p bench-out
	spam_bench_cmds | STRICT_SCHEDULING=1 parallelize
}

function bench {
	rm -rf bench-out
	mkdir -p bench-out
	spam_bench_cmds | STRICT_SCHEDULING=1 parallelize
}

case "$cmd" in
*)
	default_cmd_handler "$@"
	;;
esac
