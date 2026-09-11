barretenberg_module(api chonk bbapi dsl libdeflate::libdeflate_static nlohmann_json::nlohmann_json)

# Link avm_transpiler when library is provided
if(AVM_TRANSPILER_LIB)
    target_link_libraries(api_objects PRIVATE avm_transpiler)
endif()

if(NOT WASM AND NOT BB_LITE)
    target_link_libraries(api_objects PRIVATE ipc)
endif()

# api_tests drives the bbapi command set and the msgpack stream server, so it needs the same vm2_stub and ipc
# links that the bb binary and bbapi_tests use.
if(NOT WASM AND NOT FUZZING)
    target_link_libraries(api_tests PRIVATE vm2_stub)
    if(NOT BB_LITE)
        target_link_libraries(api_tests PRIVATE ipc)
    endif()
endif()
