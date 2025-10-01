for i in {1..1000000}; do scripts/run_bench.sh wasm bb-micro-bench/wasm/client_ivc build-wasm-threads/bin/client_ivc_bench ClientIVCBench/Full/2$ ; done 2>&1 | tee results.txt
