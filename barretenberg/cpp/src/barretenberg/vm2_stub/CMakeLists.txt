# Stub module for AVM functionality when building without vm2
# This provides the same interface as vm2/dsl but throws runtime errors
# Using OBJECT library to avoid static library link ordering issues with dsl
file(GLOB_RECURSE SOURCE_FILES *.cpp)
list(FILTER SOURCE_FILES EXCLUDE REGEX ".*\\.(fuzzer|test|bench)\\.cpp$")

add_library(vm2_stub OBJECT ${SOURCE_FILES})
target_link_libraries(vm2_stub PUBLIC barretenberg_headers)
