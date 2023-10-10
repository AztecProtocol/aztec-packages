#!/bin/bash

(BENCHMARK_FD=3 ./run_acir_tests.sh $@ 3>&1 > /dev/null) | jq -r 'select(.name == "proof_construction_time") | [.acir_test, .value] | @tsv'  | awk 'BEGIN {
    FS="\t";
    print "+--------------------------+-----------+";
    print "| Test                     | Time (ms) |";
    print "+--------------------------+-----------+";
}
{
    # Truncate name to 24 characters
    name = substr($1, 1, 24);
    printf("| %-24s | %9s |\n", name, $2);
}
END {
    print "+--------------------------+-----------+";
}'