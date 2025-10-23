if(NOT DISABLE_AZTEC_VM)
  barretenberg_module(vm2 sumcheck stdlib_honk_verifier stdlib_goblin_verifier)
endif()

# Include only simulation-related sources from vm2
file(GLOB_RECURSE SOURCE_FILES
  simulation/*.cpp
  common/*.cpp
  tooling/*.cpp
)

# Exclude test, bench, and fuzzer files
list(FILTER SOURCE_FILES EXCLUDE REGEX ".*\\.(test|bench|fuzzer)\\.cpp$")

add_library(vm2_sim STATIC
  ${SOURCE_FILES}
  simulation_helper.cpp
  avm_sim_api.cpp)

# Link only necessary dependencies for simulation (we don't want all vm2 witgen and circuit code)
target_link_libraries(
  vm2_sim
  PUBLIC
  world_state
  ${TRACY_LIBS}
  ${TBB_IMPORTED_TARGETS}
)

if(FUZZING)
  target_compile_options(
    vm2_sim_objects
    PRIVATE
    -fsanitize=fuzzer-no-link
  )
endif()
