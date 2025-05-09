#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

function bench_cmds {
	local hash=$(git rev-list -n 1 ${AZTEC_CACHE_COMMIT:-HEAD})

	rm -rf bench-out && mkdir -p bench-out
	if cache_download simulator-bench-results-$hash.tar.gz; then
		return
	fi
	BENCH_OUTPUT=$root/yarn-project/simulator/bench-out/sim-bench.json LOG_LEVEL=info yarn test src/public/public_tx_simulator/apps_tests/bench.test.ts
	cache_upload simulator-bench-results-$hash.tar.gz ./bench-out/sim-bench.json
}

case "$cmd" in
"clean")
	git clean -fdx
	;;
"bench")
	$cmd
	;;
*)
	echo "Unknown command: $cmd"
	exit 1
	;;
esac
