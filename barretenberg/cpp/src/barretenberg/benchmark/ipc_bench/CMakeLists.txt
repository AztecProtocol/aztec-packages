barretenberg_module(ipc_bench crypto_poseidon2)

if(NOT WASM)
    target_link_libraries(api_objects PRIVATE ipc)
endif()
