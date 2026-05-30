set(KVDB_SCHEMA ${CMAKE_CURRENT_SOURCE_DIR}/kvdb_schema.json)
set(KVDB_GEN_DIR ${CMAKE_CURRENT_SOURCE_DIR}/generated)
set(KVDB_GEN_OUTPUTS
    ${KVDB_GEN_DIR}/kvdb_ipc_client.cpp
    ${KVDB_GEN_DIR}/kvdb_ipc_client.hpp
    ${KVDB_GEN_DIR}/kvdb_ipc_server.hpp
    ${KVDB_GEN_DIR}/kvdb_types.hpp
    ${KVDB_GEN_DIR}/ipc_codegen/msgpack_adaptor.hpp
    ${KVDB_GEN_DIR}/ipc_codegen/named_union.hpp
    ${KVDB_GEN_DIR}/ipc_codegen/schema.hpp
    ${KVDB_GEN_DIR}/ipc_codegen/throw.hpp
)
set(IPC_CODEGEN_DIR ${CMAKE_SOURCE_DIR}/../../ipc-codegen)
file(GLOB_RECURSE IPC_CODEGEN_SRC
    ${IPC_CODEGEN_DIR}/src/*.ts
    ${IPC_CODEGEN_DIR}/templates/cpp/*.hpp
)
add_custom_command(
    OUTPUT ${KVDB_GEN_OUTPUTS}
    COMMAND node --experimental-strip-types --experimental-transform-types --no-warnings
            ${IPC_CODEGEN_DIR}/src/generate.ts
            --schema ${KVDB_SCHEMA}
            --lang cpp
            --out ${KVDB_GEN_DIR}
            --client --server
            --cpp-namespace bb::kvdb
            --cpp-include-dir barretenberg/kvdb/generated
            --prefix Kvdb
    DEPENDS ${KVDB_SCHEMA} ${IPC_CODEGEN_SRC}
    COMMENT "Generating KVDB IPC client + server from kvdb_schema.json"
    VERBATIM
)
add_custom_target(kvdb_ipc_generated DEPENDS ${KVDB_GEN_OUTPUTS})

# aztec-kvdb binary (standalone LMDB-backed key-value store server). Used by
# archiver, p2p, pxe, slasher, and validator-ha-signer via the @aztec/kv-store
# `lmdb-v2` backend. Communicates with the TS host over UDS or MPSC SHM.
add_executable(
    aztec-kvdb
    main.cpp
    cli.cpp
    kvdb_ipc_server.cpp
)
add_dependencies(aztec-kvdb kvdb_ipc_generated)
target_include_directories(
    aztec-kvdb
    PRIVATE
    ${KVDB_GEN_DIR}
)
target_link_libraries(
    aztec-kvdb
    PRIVATE
    lmdblib
    ipc_runtime
    env
)
if(ENABLE_STACKTRACES)
    target_link_libraries(
        aztec-kvdb
        PUBLIC
        Backward::Interface
    )
    target_link_options(
        aztec-kvdb
        PRIVATE
        -ldw -lelf
    )
endif()
