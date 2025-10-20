# Boomerang value detector of noir-generated programs

## Overview
1) (ssa_fuzzer)[https://github.com/noir-lang/noir/tree/master/tooling/ssa_fuzzer] generates ACIR programs, pushes them to redies queue
2) (loader)[./load_artifacts.sh] loads all artifacts and stores them into `artifacts` dir
3) (...?) read every file from dir, and tests if there are boomerang values in generated programs
