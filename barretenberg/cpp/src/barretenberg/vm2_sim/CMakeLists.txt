# Much of this file is copied from module.cmake,
# but this is meant to create a minimal module for vm2 simulation
# for the nodejs_module to link against for access to C++ simulation through NAPI

# Include only simulation-related sources from vm2
file(GLOB_RECURSE SOURCE_FILES
  ../vm2/simulation/*.cpp
  ../vm2/common/*.cpp
)

# Add top-level vm2 files needed for simulation
list(APPEND SOURCE_FILES
  ../vm2/simulation_helper.cpp
  ../vm2/avm_api.cpp
)

# Exclude test, bench, and fuzzer files
list(FILTER SOURCE_FILES EXCLUDE REGEX ".*\\.(test|bench|fuzzer)\\.cpp$")

# Collect header files for installation
file(GLOB_RECURSE HEADER_FILES
  ../vm2/simulation/*.hpp
  ../vm2/common/*.hpp
  ../vm2/simulation_helper.hpp
  ../vm2/avm_api.hpp
)

target_sources(
  barretenberg_headers
  INTERFACE
  FILE_SET HEADERS
  FILES ${HEADER_FILES}
)

# Create object library for parallel compilation
add_library(vm2_sim_objects OBJECT ${SOURCE_FILES})

# Create static library from object files
add_library(vm2_sim STATIC $<TARGET_OBJECTS:vm2_sim_objects>)

# Link only necessary dependencies for simulation (we don't want all vm2 witgen and circuit code)
target_link_libraries(
  vm2_sim
  PUBLIC
  world_state
  ${TRACY_LIBS}
  ${TBB_IMPORTED_TARGETS}
)

# Include vm2 directory so headers can be found
target_include_directories(vm2_sim_objects PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/..)

if(ENABLE_STACKTRACES)
  target_link_libraries(
    vm2_sim_objects
    PUBLIC
    Backward::Interface
  )
  target_link_options(
    vm2_sim
    PRIVATE
    -ldw -lelf
  )
endif()

if(FUZZING)
  target_compile_options(
    vm2_sim_objects
    PRIVATE
    -fsanitize=fuzzer-no-link
  )
endif()

# Add msgpack dependency
add_dependencies(vm2_sim msgpack-c)
add_dependencies(vm2_sim_objects msgpack-c)

# Add lmdb dependency
if(NOT CMAKE_SYSTEM_PROCESSOR MATCHES "wasm32")
  add_dependencies(vm2_sim lmdb_repo)
  add_dependencies(vm2_sim_objects lmdb_repo)
endif()
