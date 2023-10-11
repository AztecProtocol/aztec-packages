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

# Build results into string with \n delimited rows and space delimited values.
TABLE_DATA=""
for TEST in ${TEST_NAMES[@]}; do
    TABLE_DATA+="$TEST"
    for HC in "${THREADS[@]}"; do
        RESULT=$(cat $BENCHMARKS | jq -r --arg test "$TEST" --argjson hc $HC 'select(.name == "proof_construction_time" and .acir_test == $test and .threads == $hc) | .value')
        TABLE_DATA+=" $RESULT"
    done
    TABLE_DATA+=$'\n'
done

# Trim the trailing newline.
TABLE_DATA="${TABLE_DATA%$'\n'}"

echo
echo Table represents time in ms to build circuit and proof for each test on n threads.
echo Ignores proving key construction.
echo
# Use awk to print the table
echo -e "$TABLE_DATA" | awk -v threads="${THREADS[*]}" 'BEGIN {
    split(threads, t, " ");
    len_threads = length(t);
    print "+--------------------------+" genseparator(len_threads);
    print "| Test                     |" genthreadheaders(t, len_threads);
    print "+--------------------------+" genseparator(len_threads);
}
{
    printf("| %-24s |", $1);
    for (i = 2; i <= len_threads+1; i++) {
        printf " %9s |", $(i);
    }
    print "";
}
END {
    print "+--------------------------+" genseparator(len_threads);
}
function genseparator(len,   res) {
    for (i = 1; i <= len; i++) res = res "-----------+";
    return res;
}
function genthreadheaders(t, len,   res) {
    for (i = 1; i <= len; i++) res = res sprintf(" %9s |", t[i]);
    return res;
}
'

rm $BENCHMARKS