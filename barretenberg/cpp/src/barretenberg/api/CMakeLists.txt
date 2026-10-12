barretenberg_module(api chonk bbapi dsl libdeflate::libdeflate_static nlohmann_json::nlohmann_json)

# Link avm_transpiler when library is provided
if(AVM_TRANSPILER_LIB)
    target_link_libraries(api_objects PRIVATE avm_transpiler)
endif()

if(NOT WASM AND NOT BB_LITE)
    target_link_libraries(api_objects PRIVATE ipc_runtime)
    if(TARGET api_tests AND NOT FUZZING)
        # The reactor test serves bb's whole msgpack API, which reaches dsl's AVM references, resolved by vm2_stub.
        target_link_libraries(api_tests PRIVATE ipc_runtime vm2_stub)
    endif()
endif()
