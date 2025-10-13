barretenberg_module(avm_fuzzer vm2_objects vm2)

add_executable(avm_fuzzer_bin
    main.cpp
    fuzz_lib/control_flow.cpp
    fuzz_lib/program_block.cpp
    fuzz_lib/fuzz.cpp
    fuzz_lib/simulator.cpp
    fuzz_lib/memory_manager.cpp
    mutations/fuzzer_data.cpp
    mutations/instructions/instruction_vec.cpp
    mutations/instructions/instruction.cpp
    mutations/basic_types/vector.cpp
    mutations/basic_types/memory_tag.cpp
    mutations/basic_types/uint16_t.cpp
    mutations/basic_types/uint8_t.cpp
)
target_link_libraries(avm_fuzzer_bin vm2)
