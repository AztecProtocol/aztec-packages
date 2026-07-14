# Tests that drive the C++ AVM simulator (`vm2`) with real compiled Noir contract artifacts.
#
# This module is built as part of the normal barretenberg C++ build (it links `vm2`), but its
# `vm2_contracts_tests` binary is meant to be RUN from the noir-projects test phase, after the
# contract artifacts it loads (e.g. noir-projects/noir-contracts/target/*.json) have been produced.
# barretenberg builds before noir-projects, so these tests cannot run in the bb test phase.
#
# Only meaningful with the AVM enabled (the `vm2` library only exists when AVM=ON).
if(AVM)
    barretenberg_module(vm2_contracts vm2)
endif()
