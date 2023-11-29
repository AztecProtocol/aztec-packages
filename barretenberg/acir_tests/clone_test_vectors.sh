#!/bin/bash
set -eu

TEST_SRC=${TEST_SRC:-../../noir/test_programs}

if [ ! -d acir_tests ]; then
  cp -R $TEST_SRC/acir_artifacts acir_tests
fi

cp $TEST_SRC/rebuild.sh .