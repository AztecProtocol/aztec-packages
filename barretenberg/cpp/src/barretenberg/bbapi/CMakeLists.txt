# Generate BB IPC wire types and dispatchers from bb_schema.json. WASM builds
# consume the generated dispatch header, so codegen must run outside native-only
# blocks.
set(BB_SCHEMA ${CMAKE_CURRENT_SOURCE_DIR}/bb_schema.json)
set(BB_GEN_DIR ${CMAKE_CURRENT_SOURCE_DIR}/generated)

if(NOT FUZZING)
    set(BB_GEN_OUTPUTS
        ${BB_GEN_DIR}/bb_ipc_client.cpp
        ${BB_GEN_DIR}/bb_ipc_client.hpp
        ${BB_GEN_DIR}/bb_dispatch.hpp
        ${BB_GEN_DIR}/bb_ipc_server.hpp
        ${BB_GEN_DIR}/bb_types.hpp
        ${BB_GEN_DIR}/ipc_codegen/msgpack_adaptor.hpp
        ${BB_GEN_DIR}/ipc_codegen/named_union.hpp
        ${BB_GEN_DIR}/ipc_codegen/schema.hpp
        ${BB_GEN_DIR}/ipc_codegen/throw.hpp
    )
    set(IPC_CODEGEN_DIR ${CMAKE_SOURCE_DIR}/../../ipc-codegen)
    file(GLOB_RECURSE IPC_CODEGEN_SRC
        ${IPC_CODEGEN_DIR}/src/*.ts
        ${IPC_CODEGEN_DIR}/templates/cpp/*.hpp
    )
    add_custom_command(
        OUTPUT ${BB_GEN_OUTPUTS}
        COMMAND node --experimental-strip-types --experimental-transform-types --no-warnings
                ${IPC_CODEGEN_DIR}/src/generate.ts
                --schema ${BB_SCHEMA}
                --lang cpp
                --out ${BB_GEN_DIR}
                --client --server
                --cpp-namespace bb::bbapi
                --prefix Bb
                --strip-method-prefix
        DEPENDS ${BB_SCHEMA} ${IPC_CODEGEN_SRC}
        COMMENT "Generating BB IPC client + server from bb_schema.json"
        VERBATIM
    )
    add_custom_target(bb_codegen DEPENDS ${BB_GEN_OUTPUTS})
endif()

barretenberg_module(bbapi common chonk dsl crypto_poseidon2 crypto_pedersen_commitment crypto_pedersen_hash crypto_blake2s crypto_aes128 crypto_schnorr crypto_ecdsa ecc srs)

if(NOT FUZZING)
    add_dependencies(bbapi_objects bb_codegen)
endif()

# bbapi_tests needs vm2_stub to resolve dsl's AVM recursion constraint references,
# and the generated dispatch header to drive the dispatcher. Tests are native-only.
if(NOT WASM AND NOT FUZZING)
    target_link_libraries(bbapi_tests PRIVATE vm2_stub)
endif()
