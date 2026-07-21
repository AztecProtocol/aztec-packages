barretenberg_module(api chonk bbapi dsl libdeflate::libdeflate_static nlohmann_json::nlohmann_json)

# Link avm_transpiler when library is provided
if(AVM_TRANSPILER_LIB)
    target_link_libraries(api_objects PRIVATE avm_transpiler)
endif()

if(NOT WASM AND NOT BB_LITE)
    target_link_libraries(api_objects PRIVATE ipc)
endif()
