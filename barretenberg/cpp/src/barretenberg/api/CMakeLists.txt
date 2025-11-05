barretenberg_module(api chonk bbapi dsl libdeflate::libdeflate_static nlohmann_json::nlohmann_json)

# Link avm_transpiler when library is provided
if(AVM_TRANSPILER_LIB)
    target_link_libraries(api_objects PRIVATE avm_transpiler)
endif()

if(NOT WASM)
    target_link_libraries(api_objects PRIVATE ipc)
endif()

# api_tests needs vm2_stub to resolve dsl's AVM recursion constraint references
if(NOT WASM AND NOT FUZZING)
    target_link_libraries(api_tests PRIVATE vm2_stub)
endif()
