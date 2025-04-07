if(NOT DISABLE_AZTEC_VM)
  barretenberg_module(vm2 vm sumcheck stdlib_honk_verifier stdlib_goblin_verifier)
endif()

# TODO: Remove vm from dependencies once we move stats.hpp to vm2.