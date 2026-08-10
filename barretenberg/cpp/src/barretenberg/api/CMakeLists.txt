barretenberg_module(api chonk bbapi dsl libdeflate::libdeflate_static nlohmann_json::nlohmann_json)

if(NOT WASM AND NOT BB_LITE)
    target_link_libraries(api_objects PRIVATE ipc)
endif()
