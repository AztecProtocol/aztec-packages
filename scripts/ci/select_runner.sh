#!/bin/bash

# Check if the test requires a prover
requires_prover() {
  local test_name=$1
  [[ $test_name == *"prover"* ]]
}

test_name=$1

if requires_prover "$test_name"; then
  echo "64core-tester-x86"
else
  if [[ $test_name == *"bench"* ]]; then
    echo "16core-tester-x86"
  else
    echo "8core-tester-x86"
  fi
fi
