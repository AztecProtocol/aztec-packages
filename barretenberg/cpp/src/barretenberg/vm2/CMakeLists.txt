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

# Exclude the WSDB IPC-backed DB shim from vm2_sim — it pulls in wsdb_ipc_client
# and ipc, which pure-simulation consumers (e.g. nodejs_module, wasm) don't
# need. It's compiled below as its own library, only when wsdb is available.
list(FILTER VM2_SIM_SOURCE_FILES EXCLUDE REGEX ".*/simulation/dbs/wsdb_ipc_merkle_db\\.cpp$")

# Build vm2_sim module (for nodejs bindings)
barretenberg_module_with_sources(
  vm2_sim
  SOURCE_FILES ${VM2_SIM_SOURCE_FILES}
  DEPENDENCIES world_state
)

# vm2_sim needs -fPIC because it's linked into the nodejs_module shared library
set_target_properties(vm2_sim_objects PROPERTIES POSITION_INDEPENDENT_CODE ON)

# WSDB IPC-backed implementation of LowLevelMerkleDBInterface.
# Lives alongside the other DB impls under simulation/dbs/ but is compiled
# into its own library so vm2_sim (and therefore nodejs_module / wasm) don't
# pull in the IPC stack.
if(NOT(FUZZING) AND NOT(WASM))
    add_library(
        wsdb_ipc_merkle_db
        STATIC
        simulation/dbs/wsdb_ipc_merkle_db.cpp
    )
    target_link_libraries(
        wsdb_ipc_merkle_db
        PUBLIC
        barretenberg
        wsdb_ipc_client
        ipc
        vm2_sim
    )
    set_target_properties(wsdb_ipc_merkle_db PROPERTIES POSITION_INDEPENDENT_CODE ON)
endif()

# Build vm2 module with sources mutually exclusive from vm2_sim
if(AVM)
  # Collect all source files
  file(GLOB_RECURSE ALL_SOURCE_FILES *.cpp)
  file(GLOB_RECURSE TEST_SOURCE_FILES *.test.cpp)
  file(GLOB_RECURSE BENCH_SOURCE_FILES *.bench.cpp)
  file(GLOB_RECURSE FUZZERS_SOURCE_FILES *.fuzzer.cpp)

  # Start with all sources, then exclude test/bench/fuzzer files
  set(VM2_SOURCE_FILES ${ALL_SOURCE_FILES})
  list(FILTER VM2_SOURCE_FILES EXCLUDE REGEX ".*\\.(test|bench|fuzzer)\\.cpp$")

  # Same carve-out as vm2_sim: wsdb_ipc_merkle_db is its own library.
  list(FILTER VM2_SOURCE_FILES EXCLUDE REGEX ".*/simulation/dbs/wsdb_ipc_merkle_db\\.cpp$")

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
    DEPENDENCIES sumcheck stdlib_honk_verifier goblin_avm world_state vm2_sim boomerang_value_detection
  )

  # vm2_tests needs dsl for integration testing, but this creates circular dependency:
  # vm2 provides functions that dsl calls, but tests need dsl functions.
  # Solution: Link dsl, then vm2 again to resolve the circular reference.
  if(NOT WASM AND NOT FUZZING)
      target_link_libraries(vm2_tests PRIVATE dsl vm2)
  endif()

  if(FUZZING)
      target_compile_options(
          vm2
          PRIVATE
          -fsanitize=fuzzer-no-link)
  endif()


endif()
