# vm2_shared: Minimal library containing only files needed for recursive verifier
# This allows dsl to depend on just the recursion components without pulling in full AVM
# This must be created unconditionally since dsl depends on it

# Collect source files needed for recursion
set(VM2_SHARED_SOURCES
  common/avm_inputs.cpp
  constraining/flavor.cpp
  constraining/full_row.cpp
  constraining/recursion/recursive_verifier.cpp
  optimized/relations/poseidon2_perm.cpp
)

# Collect all tracegen files (except tests)
file(GLOB VM2_TRACEGEN_SOURCES tracegen/*.cpp tracegen/lib/*.cpp)
list(FILTER VM2_TRACEGEN_SOURCES EXCLUDE REGEX ".*\\.test\\.cpp$")
list(APPEND VM2_SHARED_SOURCES ${VM2_TRACEGEN_SOURCES})

# Collect all generated relation files
file(GLOB VM2_RELATIONS_SOURCES generated/relations/*.cpp)
list(APPEND VM2_SHARED_SOURCES ${VM2_RELATIONS_SOURCES})

# Collect recursive flavor instantiations (only for vm2_shared)
file(GLOB VM2_RECURSIVE_RELATIONS_SOURCES constraining/recursion/generated/relations/*.cpp)
list(APPEND VM2_SHARED_SOURCES ${VM2_RECURSIVE_RELATIONS_SOURCES})

# Create vm2_shared object library
add_library(vm2_shared_objects OBJECT ${VM2_SHARED_SOURCES})
target_link_libraries(vm2_shared_objects PUBLIC sumcheck stdlib_honk_verifier stdlib_goblin_verifier)
add_dependencies(vm2_shared_objects msgpack-c)

# Create vm2_shared static library
add_library(vm2_shared STATIC $<TARGET_OBJECTS:vm2_shared_objects>)
target_link_libraries(vm2_shared PUBLIC sumcheck stdlib_honk_verifier stdlib_goblin_verifier)

# Full vm2 module with everything (only when AVM is enabled)
if(NOT DISABLE_AZTEC_VM AND NOT FUZZING)
  barretenberg_module(vm2 sumcheck stdlib_honk_verifier stdlib_goblin_verifier)
endif()
