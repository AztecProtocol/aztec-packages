#!/bin/bash
testname=$1
script_dir=$(dirname "$0")

export LOG_LEVEL=debug

# Run tests in batches of 10
for batch in {0..9}
do
  # Start 10 tests in parallel
  for i in {1..10}
  do
    test_num=$((batch * 10 + i))
    (
      echo "Run #$test_num"
      if ! yarn test $1 > $script_dir/deflaker${test_num}.log 2>&1; then
        echo "Test #$test_num failed"
        exit 1
      fi
    ) &
  done

  # Wait for all tests in this batch to complete
  if ! wait; then
    echo "One or more tests in batch $((batch + 1)) failed"
    exit 1
  fi
done

echo "All tests passed successfully"
