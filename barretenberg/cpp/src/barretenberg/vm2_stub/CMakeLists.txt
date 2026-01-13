# Stub module for AVM functionality when building without vm2
# This provides the same interface as vm2/dsl but throws runtime errors
file(GLOB_RECURSE SOURCE_FILES *.cpp)
list(FILTER SOURCE_FILES EXCLUDE REGEX ".*\\.(fuzzer|test|bench)\\.cpp$")

# OBJECT library for internal use (WASM builds, tests that need direct object inclusion)
add_library(vm2_stub OBJECT ${SOURCE_FILES})
add_dependencies(vm2_stub msgpack-c)
target_link_libraries(vm2_stub PUBLIC barretenberg_headers)

# Static library for external consumers (barretenberg-rs) that need a .a file to link against
add_library(vm2_stub_static STATIC $<TARGET_OBJECTS:vm2_stub>)
set_target_properties(vm2_stub_static PROPERTIES OUTPUT_NAME "vm2_stub")
