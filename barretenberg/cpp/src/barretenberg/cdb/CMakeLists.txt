set(CDB_SCHEMA ${CMAKE_CURRENT_SOURCE_DIR}/cdb_schema.json)
set(CDB_GEN_DIR ${CMAKE_CURRENT_SOURCE_DIR}/generated)
set(CDB_GEN_OUTPUTS
    ${CDB_GEN_DIR}/cdb_ipc_client.cpp
    ${CDB_GEN_DIR}/cdb_ipc_client.hpp
    ${CDB_GEN_DIR}/cdb_ipc_server.hpp
    ${CDB_GEN_DIR}/cdb_types.hpp
    ${CDB_GEN_DIR}/ipc_codegen/msgpack_adaptor.hpp
    ${CDB_GEN_DIR}/ipc_codegen/named_union.hpp
    ${CDB_GEN_DIR}/ipc_codegen/schema.hpp
    ${CDB_GEN_DIR}/ipc_codegen/throw.hpp
)
set(IPC_CODEGEN_DIR ${CMAKE_SOURCE_DIR}/../../ipc-codegen)
file(GLOB_RECURSE IPC_CODEGEN_SRC
    ${IPC_CODEGEN_DIR}/src/*.ts
    ${IPC_CODEGEN_DIR}/templates/cpp/*.hpp
)
add_custom_command(
    OUTPUT ${CDB_GEN_OUTPUTS}
    COMMAND node --experimental-strip-types --experimental-transform-types --no-warnings
            ${IPC_CODEGEN_DIR}/src/generate.ts
            --schema ${CDB_SCHEMA}
            --lang cpp
            --out ${CDB_GEN_DIR}
            --client --server
            --cpp-namespace bb::cdb
            --cpp-include-dir barretenberg/cdb/generated
            --prefix Cdb
    DEPENDS ${CDB_SCHEMA} ${IPC_CODEGEN_SRC}
    COMMENT "Generating CDB IPC client + server from cdb_schema.json"
    VERBATIM
)
add_custom_target(cdb_ipc_generated DEPENDS ${CDB_GEN_OUTPUTS})

# IPC client adapter (used by AVM simulator to talk to the TS-hosted CDB server)
add_library(
    cdb_ipc_client
    STATIC
    ${CDB_GEN_DIR}/cdb_ipc_client.cpp
    cdb_ipc_client.cpp
)
add_dependencies(cdb_ipc_client cdb_ipc_generated)
target_include_directories(
    cdb_ipc_client
    PUBLIC
    ${CDB_GEN_DIR}
)
target_link_libraries(
    cdb_ipc_client
    PUBLIC
    barretenberg
    ipc_runtime
)

# aztec-cdb binary (schema provider for codegen)
add_executable(
    aztec-cdb
    main.cpp
    cli.cpp
)
add_dependencies(aztec-cdb cdb_ipc_generated)
target_include_directories(
    aztec-cdb
    PRIVATE
    ${CDB_GEN_DIR}
)
target_link_libraries(
    aztec-cdb
    PRIVATE
    barretenberg
    ipc_runtime
    env
)
if(ENABLE_STACKTRACES)
    target_link_libraries(
        aztec-cdb
        PUBLIC
        Backward::Interface
    )
    target_link_options(
        aztec-cdb
        PRIVATE
        -ldw -lelf
    )
endif()
