set(API_DEPENDENCIES
    client_ivc
    ultra_vanilla_client_ivc
    dsl)

if (NOT WASM)
    list(APPEND API_DEPENDENCIES libdeflate::libdeflate_static)
endif()


barretenberg_module(api ${API_DEPENDENCIES})
