barretenberg_module(avm_fuzzer vm2_objects)

add_executable(avm_fuzzer_bin main.cpp)
target_link_libraries(avm_fuzzer_bin vm2)
