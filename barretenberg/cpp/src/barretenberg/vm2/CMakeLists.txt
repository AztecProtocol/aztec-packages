if(NOT DISABLE_AZTEC_VM)
  barretenberg_module(vm2 sumcheck stdlib_honk_verifier stdlib_goblin_verifier world_state)
endif()

# Include only simulation-related sources from vm2
file(GLOB_RECURSE VM2_SIM_SOURCE_FILES
  simulation/*.cpp
  common/*.cpp
  tooling/*.cpp
)

# Exclude test, bench, and fuzzer files
list(FILTER VM2_SIM_SOURCE_FILES EXCLUDE REGEX ".*\\.(test|bench|fuzzer)\\.cpp$")

# TODO: this isn't a proper module. We should look into creating something we actually link.
# This can be done by using barretenberg_module_with_sources above, linking this, but with the these files explicitly excluded.
barretenberg_module_with_sources(
  vm2_sim
  SOURCE_FILES ${VM2_SIM_SOURCE_FILES}
    simulation_helper.cpp
    avm_sim_api.cpp
  DEPENDENCIES world_state
)
