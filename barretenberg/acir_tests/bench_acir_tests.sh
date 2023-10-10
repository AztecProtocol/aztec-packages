#!/bin/bash

TEST_NAMES=("$@")
THREADS=(1 4 16 32 64)
BENCHMARKS=$(mktemp)

if [ "${#TEST_NAMES[@]}" -eq 0 ]; then
    TEST_NAMES=(sha256 ecdsa_secp256k1 ecdsa_secp256r1 schnorr double_verify_proof)
fi

for TEST in ${TEST_NAMES[@]}; do
    for HC in ${THREADS[@]}; do
        HARDWARE_CONCURRENCY=$HC BENCHMARK_FD=3 ./run_acir_tests.sh $TEST 3>>$BENCHMARKS
    done
done

cat $BENCHMARKS | jq -r 'select(.name == "proof_construction_time") | [.acir_test, .threads, .value] | @tsv'  | awk 'BEGIN {
    FS="\t";
    print "+--------------------------+---------+-----------+";
    print "| Test                     | Threads | Time (ms) |";
    print "+--------------------------+---------+-----------+";
}
{
    # Truncate name to 24 characters
    name = substr($1, 1, 24);
    printf("| %-24s | %7s | %9s |\n", name, $2, $3);
}
END {
    print "+--------------------------+---------+-----------+";
}'

rm $BENCHMARKS