set(CDB_SCHEMA ${CMAKE_CURRENT_SOURCE_DIR}/cdb_schema.json)
set(CDB_GEN_DIR ${CMAKE_CURRENT_SOURCE_DIR}/generated)
set(CDB_GEN_OUTPUTS
    ${CDB_GEN_DIR}/cdb_ipc_client.cpp
    ${CDB_GEN_DIR}/cdb_ipc_client.hpp
    ${CDB_GEN_DIR}/cdb_types.hpp
    ${CDB_GEN_DIR}/ipc_codegen/msgpack_adaptor.hpp
    ${CDB_GEN_DIR}/ipc_codegen/msgpack_include.hpp
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
            --client
            --cpp-namespace bb::cdb
            --cpp-include-dir barretenberg/cdb/generated
            --prefix Cdb
            --strip-method-prefix
    DEPENDS ${CDB_SCHEMA} ${IPC_CODEGEN_SRC}
    COMMENT "Generating CDB IPC client from cdb_schema.json"
    VERBATIM
)
add_custom_target(cdb_ipc_generated DEPENDS ${CDB_GEN_OUTPUTS})

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
