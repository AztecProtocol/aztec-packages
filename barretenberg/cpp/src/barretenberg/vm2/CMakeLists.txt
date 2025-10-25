# Collect simulation-related sources (for vm2_sim module)
file(GLOB_RECURSE VM2_SIM_SOURCE_FILES
  simulation/*.cpp
  common/*.cpp
  tooling/*.cpp
)

# Add top-level sim-related files
list(APPEND VM2_SIM_SOURCE_FILES
  ${CMAKE_CURRENT_SOURCE_DIR}/simulation_helper.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/avm_sim_api.cpp
)

# Exclude test, bench, and fuzzer files
list(FILTER VM2_SIM_SOURCE_FILES EXCLUDE REGEX ".*\\.(test|bench|fuzzer)\\.cpp$")

# Build vm2_sim module (for nodejs bindings)
barretenberg_module_with_sources(
  vm2_sim
  SOURCE_FILES ${VM2_SIM_SOURCE_FILES}
  DEPENDENCIES world_state
)

# Build vm2 module with sources mutually exclusive from vm2_sim
if(NOT DISABLE_AZTEC_VM)
  # Collect all source files
  file(GLOB_RECURSE ALL_SOURCE_FILES *.cpp)
  file(GLOB_RECURSE TEST_SOURCE_FILES *.test.cpp)
  file(GLOB_RECURSE BENCH_SOURCE_FILES *.bench.cpp)
  file(GLOB_RECURSE FUZZERS_SOURCE_FILES *.fuzzer.cpp)

  # Start with all sources, then exclude test/bench/fuzzer files
  set(VM2_SOURCE_FILES ${ALL_SOURCE_FILES})
  list(FILTER VM2_SOURCE_FILES EXCLUDE REGEX ".*\\.(test|bench|fuzzer)\\.cpp$")

  # Make vm2 and vm2_sim sources mutually exclusive
  foreach(SIM_FILE ${VM2_SIM_SOURCE_FILES})
    list(REMOVE_ITEM VM2_SOURCE_FILES ${SIM_FILE})
  endforeach()

  barretenberg_module_with_sources(
    vm2
    SOURCE_FILES ${VM2_SOURCE_FILES}
    TEST_SOURCE_FILES ${TEST_SOURCE_FILES}
    BENCH_SOURCE_FILES ${BENCH_SOURCE_FILES}
    FUZZERS_SOURCE_FILES ${FUZZERS_SOURCE_FILES}
    DEPENDENCIES sumcheck stdlib_honk_verifier stdlib_goblin_verifier world_state
  )
endif()
