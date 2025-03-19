#!/bin/bash

# prove and verify using bb.js classes
set -eu

# Writes the proof, public inputs and VK to ./target
node ../../bbjs-test prove \
  -b $(realpath ./target/program.json) \
  -w $(realpath ./target/witness.gz) \
  -o $(realpath ./target) \
  ${THREAD_MODEL:-st} = "mt" && echo "--multi-threaded"

# Verify the proof by reading the files in ./target
node ../../bbjs-test verify \
  -d $(realpath ./target)

