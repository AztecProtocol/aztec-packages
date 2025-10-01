barretenberg_module(api client_ivc bbapi dsl libdeflate::libdeflate_static nlohmann_json::nlohmann_json)

# Link avm_transpiler when enabled
if(ENABLE_AVM_TRANSPILER)
    target_link_libraries(api_objects PRIVATE avm_transpiler)
endif()
