barretenberg_module(ipc_bench crypto_poseidon2 ipc_runtime)

if(NOT FUZZING)
    target_sources(ipc_bench PRIVATE ${CMAKE_SOURCE_DIR}/src/barretenberg/bbapi/generated/bb_ipc_client.cpp)
    add_dependencies(ipc_bench_objects bb_codegen)
    add_dependencies(ipc_bench bb_codegen)
endif()
